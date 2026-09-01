-- Users can now sign in before confirming their email (requires turning off
-- "Confirm email" in Supabase Auth settings -> Providers -> Email; that's a
-- dashboard setting, not something a migration can flip). Once that's off,
-- signUp() and signInWithPassword() both succeed for unconfirmed accounts,
-- so the app can no longer rely on Supabase blocking unconfirmed users at
-- login. Registering a team is the one action that still needs a confirmed
-- email, so gate it here instead.

create or replace function public.create_team_with_members(
  target_league_id uuid,
  team_name text,
  team_skill_level text,
  team_skill_description text,
  target_captain_id uuid,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team_id uuid;
begin
  if auth.uid() is null or cardinality(member_ids) not between 2 and 3
    or target_captain_id <> all(member_ids)
    or (not public.is_admin() and auth.uid() <> all(member_ids)) then
    raise exception 'Invalid team members or captain';
  end if;

  if (select count(distinct member_id) from unnest(member_ids) as member_id) <> cardinality(member_ids) then
    raise exception 'A player can only be added once';
  end if;

  if not public.is_admin() and not exists (
    select 1 from public.leagues where id = target_league_id and status = 'registration_open'
  ) then
    raise exception 'League is not open for registration';
  end if;

  if not public.is_admin() and not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then
    raise exception 'Email not confirmed';
  end if;

  insert into public.teams (league_id, name, skill_level, skill_description, captain_id, created_by)
  values (target_league_id, btrim(team_name), team_skill_level, nullif(btrim(team_skill_description), ''), target_captain_id, auth.uid())
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, is_captain, status)
  select new_team_id, member_id, member_id = target_captain_id, case when member_id = auth.uid() or public.is_admin() then 'active' else 'pending' end
  from unnest(member_ids) as member_id;

  return new_team_id;
end;
$$;
