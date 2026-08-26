-- Players added to a team by someone else must accept an invitation before
-- they count as a real (active) team member anywhere in the app.

alter table public.team_members
  add column if not exists status text not null default 'active' check (status in ('pending', 'active'));

create or replace function public.is_team_member(target_team_id uuid)
returns boolean language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id and user_id = auth.uid() and status = 'active'
  );
$$;

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
  select new_team_id, member_id, member_id = target_captain_id, case when member_id = auth.uid() then 'active' else 'pending' end
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
    values (target_team_id, added_user_id, false, case when added_user_id = auth.uid() then 'active' else 'pending' end);
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

create or replace function public.get_active_match_lineup_options(target_match_id uuid)
returns table (team_id uuid, player_id uuid, first_name text, last_name text)
language sql
security definer
set search_path = public
as $$
  select membership.team_id, profile.id, profile.first_name, profile.last_name
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.team_members membership on membership.team_id in (match.home_team_id, match.away_team_id) and membership.status = 'active'
  join public.profiles profile on profile.id = membership.user_id
  where match.id = target_match_id
    and (public.is_admin() or public.is_team_member(match.home_team_id) or public.is_team_member(match.away_team_id));
$$;

create or replace function public.get_league_team_rosters(target_league_id uuid)
returns table (team_id uuid, team_name text, player_id uuid, first_name text, last_name text, is_captain boolean)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, profile.id, profile.first_name, profile.last_name, profile.id = team.captain_id
  from public.teams team
  join public.team_members membership on membership.team_id = team.id and membership.status = 'active'
  join public.profiles profile on profile.id = membership.user_id
  where auth.uid() is not null
    and team.league_id = target_league_id
  order by team.name, (profile.id = team.captain_id) desc, profile.first_name, profile.last_name;
$$;

create or replace function public.accept_team_invitation(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_members
  set status = 'active'
  where team_id = target_team_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending invitation found for this team';
  end if;
end;
$$;

create or replace function public.decline_team_invitation(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.team_members
  where team_id = target_team_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending invitation found for this team';
  end if;
end;
$$;

create or replace function public.get_pending_team_invitations()
returns table (team_id uuid, team_name text, league_id uuid, league_name text, captain_name text)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, league.id, league.name, nullif(concat_ws(' ', captain.first_name, captain.last_name), '')
  from public.team_members membership
  join public.teams team on team.id = membership.team_id
  join public.leagues league on league.id = team.league_id
  left join public.profiles captain on captain.id = team.captain_id
  where membership.user_id = auth.uid() and membership.status = 'pending';
$$;

revoke all on function public.accept_team_invitation(uuid) from public;
revoke all on function public.decline_team_invitation(uuid) from public;
revoke all on function public.get_pending_team_invitations() from public;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.decline_team_invitation(uuid) to authenticated;
grant execute on function public.get_pending_team_invitations() to authenticated;
