-- Supabase's own "Confirm email" setting can't give us what the app needs:
-- with it ON, signUp() never returns a session until confirmed (no way to
-- let a user browse while unconfirmed); with it OFF (current setting),
-- Supabase auto-confirms every signup instantly, so email_confirmed_at is
-- never a useful "did they actually verify" signal. Track our own flag
-- instead, set only when the user clicks a magic-link email we send them
-- (see src/app/verify-email.tsx and the "Lähetä vahvistuslinkki" flow in
-- ProfileForm / RegisterForm) - fully decoupled from Supabase's own
-- confirmation bookkeeping.

alter table public.profiles add column if not exists email_verified_at timestamptz;

create or replace function public.mark_email_verified()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.profiles set email_verified_at = now() where id = auth.uid() and email_verified_at is null;
end;
$$;

revoke all on function public.mark_email_verified() from public;
grant execute on function public.mark_email_verified() to authenticated;

-- Swap the registration gate from Supabase's (now meaningless) auth.users
-- confirmation flag to our own profiles.email_verified_at.
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
    select 1 from public.profiles where id = auth.uid() and email_verified_at is not null
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
