-- A pending invitation is very likely to be accepted, so show the invited
-- player on the public roster too, just marked as pending.

drop function if exists public.get_league_team_rosters(uuid);

create or replace function public.get_league_team_rosters(target_league_id uuid)
returns table (team_id uuid, team_name text, player_id uuid, first_name text, last_name text, is_captain boolean, status text)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, profile.id, profile.first_name, profile.last_name, profile.id = team.captain_id, membership.status
  from public.teams team
  join public.team_members membership on membership.team_id = team.id
  join public.profiles profile on profile.id = membership.user_id
  where auth.uid() is not null
    and team.league_id = target_league_id
  order by team.name, (profile.id = team.captain_id) desc, membership.status, profile.first_name, profile.last_name;
$$;
