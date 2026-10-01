-- 097 made get_league_standings_with_tiebreakers fall back to the most
-- recently completed regular round while no regular round is active (e.g.
-- during a qualification round), but the per-category overload the app
-- actually calls (077) never got that fallback - so the standings screen had
-- nothing to show during qualification. Give it the same fallback, so the
-- previous round's final group tables (with who promotes, relegates and
-- qualifies) stay visible until the next regular round starts.
create or replace function public.get_league_standings_with_tiebreakers(target_league_id uuid, target_category text)
returns table (group_id uuid, group_name text, team_id uuid, team_name text, played bigint, wins bigint, losses bigint, points bigint, rank_position integer)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select public.is_admin() or exists (
      select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing'
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
  where authorized.allowed and effective_round.id is not null and league_group.category = target_category;
$$;
