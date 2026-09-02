-- get_league_team_rosters is meant to be public (it backs the anonymous
-- website's team list, per 067_public_tournament_viewing.sql and
-- 076_team_rosters_newest_first.sql), but 076 accidentally added an
-- `auth.uid() is not null` guard that blocked anonymous visitors entirely.
-- Drop that guard so logged-out visitors can see registered teams/players again.

drop function if exists public.get_league_team_rosters(uuid);

create or replace function public.get_league_team_rosters(target_league_id uuid)
returns table (team_id uuid, team_name text, category text, player_id uuid, first_name text, last_name text, is_captain boolean, status text)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, team.category, profile.id, profile.first_name, profile.last_name, profile.id = team.captain_id, membership.status
  from public.teams team
  join public.team_members membership on membership.team_id = team.id
  join public.profiles profile on profile.id = membership.user_id
  where team.league_id = target_league_id
  order by team.created_at desc, (profile.id = team.captain_id) desc, membership.status, profile.first_name, profile.last_name;
$$;

revoke all on function public.get_league_team_rosters(uuid) from public;
grant execute on function public.get_league_team_rosters(uuid) to authenticated, anon;
