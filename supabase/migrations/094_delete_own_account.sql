-- Self-service account deletion (App Store 5.1.1(v) / Google Play Account
-- Deletion requirement). We can't hard-delete the auth.users row: teams,
-- leagues, match lineups and substitute approvals all reference profiles.id
-- WITHOUT "on delete cascade" (on purpose, so league history stays intact),
-- so a hard delete would throw a foreign-key error for anyone who ever
-- played a match, captained a team, or created a league - which is most
-- engaged users. Instead we anonymize the profile in place (scrub PII,
-- keep the id so historical rows keep resolving) and the delete-account
-- edge function separately locks the auth identity out.

alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and deleted_at is not null) then
    raise exception 'Account already deleted';
  end if;

  update public.profiles
  set first_name = 'Poistettu',
      last_name = 'kayttaja',
      email = 'poistettu-' || left(id::text, 8) || '@tahtiliiga.fi',
      phone = null,
      gender = null,
      skill_level = null,
      deleted_at = now()
  where id = auth.uid();

  delete from public.push_tokens where user_id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- Keep deleted profiles out of every player search.
create or replace function public.search_profiles_by_name(search_query text, target_league_id uuid, target_category text)
returns table (id uuid, first_name text, last_name text, player_code integer)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.player_code
  from public.profiles profile
  where auth.uid() is not null
    and profile.deleted_at is null
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
    and not exists (
      select 1
      from public.team_members membership
      join public.teams team on team.id = membership.team_id
      where membership.user_id = profile.id
        and team.league_id = target_league_id
        and team.category = target_category
    )
  order by profile.first_name, profile.last_name
  limit 5;
$$;

create or replace function public.search_match_substitutes(target_match_id uuid, target_team_id uuid, search_query text)
returns table (id uuid, first_name text, last_name text)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.profiles profile on profile.deleted_at is null
  where match.id = target_match_id
    and target_team_id in (match.home_team_id, match.away_team_id)
    and (public.is_admin() or public.is_team_member(target_team_id))
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
  order by profile.first_name, profile.last_name
  limit 5;
$$;

create or replace function public.find_profile_by_email(search_email text)
returns table (id uuid, first_name text, last_name text)
language sql security definer set search_path = public
as $$ select p.id, p.first_name, p.last_name from public.profiles p where auth.uid() is not null and p.deleted_at is null and lower(p.email) = lower(search_email) limit 1; $$;

create or replace function public.search_players_for_notification(search_query text)
returns table (id uuid, first_name text, last_name text)
language sql security definer set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name
  from public.profiles profile
  where public.is_admin()
    and profile.deleted_at is null
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
  order by profile.first_name, profile.last_name
  limit 5;
$$;
