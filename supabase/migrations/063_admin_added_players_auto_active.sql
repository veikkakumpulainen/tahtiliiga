-- When an admin registers a team or adds a player to a roster, the players
-- didn't choose each other the way peer-invited teammates did - there's
-- nothing for them to accept, so skip the pending-invitation step entirely.

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

  insert into public.teams (league_id, name, skill_level, skill_description, captain_id, created_by)
  values (target_league_id, btrim(team_name), team_skill_level, nullif(btrim(team_skill_description), ''), target_captain_id, auth.uid())
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, is_captain, status)
  select new_team_id, member_id, member_id = target_captain_id, case when member_id = auth.uid() or public.is_admin() then 'active' else 'pending' end
  from unnest(member_ids) as member_id;

  return new_team_id;
end;
$$;

create or replace function public.admin_update_team_roster(
  target_team_id uuid,
  removed_user_id uuid default null,
  added_user_id uuid default null,
  new_captain_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  target_league_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage team rosters';
  end if;

  select league_id into target_league_id
  from public.teams
  where id = target_team_id;
  if target_league_id is null then
    raise exception 'Team not found';
  end if;

  if removed_user_id is not null and not exists (
    select 1 from public.team_members where team_id = target_team_id and user_id = removed_user_id
  ) then
    raise exception 'The removed player does not belong to this team';
  end if;

  if added_user_id is not null and exists (
    select 1 from public.team_members where team_id = target_team_id and user_id = added_user_id
  ) then
    raise exception 'The added player already belongs to this team';
  end if;

  if removed_user_id is not null then
    delete from public.team_members where team_id = target_team_id and user_id = removed_user_id;
  end if;

  if added_user_id is not null then
    insert into public.team_members (team_id, user_id, is_captain, status)
    values (target_team_id, added_user_id, false, 'active');
  end if;

  select count(*) into member_count
  from public.team_members
  where team_id = target_team_id;
  if member_count not between 2 and 3 then
    raise exception 'A team must have two or three players';
  end if;

  if new_captain_id is not null then
    if not exists (select 1 from public.team_members where team_id = target_team_id and user_id = new_captain_id and status = 'active') then
      raise exception 'The captain must be an active member of the team';
    end if;
    update public.team_members set is_captain = user_id = new_captain_id where team_id = target_team_id;
    update public.teams set captain_id = new_captain_id where id = target_team_id;
  elsif not exists (select 1 from public.team_members where team_id = target_team_id and is_captain) then
    raise exception 'Choose a new captain before removing the current captain';
  end if;
end;
$$;
