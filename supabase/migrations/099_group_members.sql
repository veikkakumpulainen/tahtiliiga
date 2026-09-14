-- Lets a lohkochat viewer see who else is in the group: names and teams of
-- every player on a team assigned to that group. Mirrors
-- get_league_team_rosters (security definer, any authenticated user) but
-- scoped to one group instead of a whole league.

create or replace function public.get_group_members(target_group_id uuid)
returns table (team_id uuid, team_name text, player_id uuid, first_name text, last_name text, is_captain boolean, status text)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, profile.id, profile.first_name, profile.last_name, profile.id = team.captain_id, membership.status
  from public.group_teams group_team
  join public.teams team on team.id = group_team.team_id
  join public.team_members membership on membership.team_id = team.id
  join public.profiles profile on profile.id = membership.user_id
  where auth.uid() is not null
    and group_team.group_id = target_group_id
  order by team.name, (profile.id = team.captain_id) desc, membership.status, profile.first_name, profile.last_name;
$$;

revoke all on function public.get_group_members(uuid) from public;
grant execute on function public.get_group_members(uuid) to authenticated;
