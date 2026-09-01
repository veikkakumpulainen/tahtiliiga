-- Lets admins announce a league before registration actually opens: create it
-- with status 'upcoming' and a registration_opens_at date, so it's visible to
-- everyone as "coming soon" while the admin still has to press a separate
-- button later to flip it to 'registration_open'.

alter table public.leagues drop constraint if exists leagues_status_check;
alter table public.leagues add constraint leagues_status_check
  check (status in ('upcoming', 'registration_open', 'registration_closed', 'ongoing', 'finished'));

alter table public.leagues add column if not exists registration_opens_at date;

alter table public.leagues drop constraint if exists leagues_registration_opens_at_before_start_date;
alter table public.leagues add constraint leagues_registration_opens_at_before_start_date
  check (registration_opens_at is null or registration_opens_at <= start_date);

-- Registration was previously open to inserts regardless of league status.
-- Now that a league can sit in 'upcoming' with no intent to accept teams
-- yet, close that gap: non-admins may only self-register while the league
-- is actually 'registration_open'. Admins keep bypassing this (e.g. to add
-- a team manually while registration is closed).
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

  insert into public.teams (league_id, name, skill_level, skill_description, captain_id, created_by)
  values (target_league_id, btrim(team_name), team_skill_level, nullif(btrim(team_skill_description), ''), target_captain_id, auth.uid())
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, is_captain, status)
  select new_team_id, member_id, member_id = target_captain_id, case when member_id = auth.uid() or public.is_admin() then 'active' else 'pending' end
  from unnest(member_ids) as member_id;

  return new_team_id;
end;
$$;
