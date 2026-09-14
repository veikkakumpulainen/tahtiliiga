-- get_league_standings_with_tiebreakers used an inner join against the active
-- "regular" round. While a qualification round is active (or between rounds,
-- with no round currently marked active) there is no such row, so the inner
-- join dropped every result and the standings screen showed nothing at all -
-- even for admins. Fall back to the most recently completed regular round so
-- the last known standings keep showing until a new regular round starts.
create or replace function public.get_league_standings_with_tiebreakers(target_league_id uuid)
returns table (group_id uuid, group_name text, team_id uuid, team_name text, played bigint, wins bigint, losses bigint, points bigint, rank_position integer)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select public.is_admin() or (
      exists (select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing')
      and exists (select 1 from public.team_members membership join public.teams team on team.id = membership.team_id where membership.user_id = auth.uid() and team.league_id = target_league_id)
    ) as allowed
  ), active_round as (
    select id from public.league_rounds where league_id = target_league_id and round_type = 'regular' and status = 'active' order by start_date desc, created_at desc limit 1
  ), fallback_round as (
    select id from public.league_rounds where league_id = target_league_id and round_type = 'regular' and status = 'completed' order by end_date desc, created_at desc limit 1
  ), effective_round as (
    select coalesce((select id from active_round), (select id from fallback_round)) as id
  )
  select ranking.group_id, league_group.name, ranking.team_id, ranking.team_name, ranking.played, ranking.wins, ranking.losses, ranking.points, ranking.rank_position
  from authorized
  cross join effective_round
  join public.get_regular_round_group_rankings(effective_round.id) ranking on true
  join public.groups league_group on league_group.id = ranking.group_id
  where authorized.allowed and effective_round.id is not null;
$$;
