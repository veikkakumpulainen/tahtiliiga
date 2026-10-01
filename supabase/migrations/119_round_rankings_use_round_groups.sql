-- get_regular_round_group_rankings took each group's teams from the *current*
-- group_teams. complete_league_round moves promoted/relegated teams to their
-- new groups, so any ranking of an already completed round afterwards showed
-- the moved teams in their new group with zero matches played - both in the
-- standings shown during qualification (097/118 fallback) and, worse, in
-- start_qualification_round, which picks the qualification pairs (upper
-- group's 3rd vs lower group's 2nd) from exactly those rankings.
--
-- A round's group membership is fixed by its own matches (start_regular_round
-- creates every in-group pairing), so take the teams from the round's matches
-- whenever it has any, and fall back to group_teams only for a round without
-- matches yet. Otherwise identical to the previous version.
create or replace function public.get_regular_round_group_rankings(target_round_id uuid)
returns table (group_id uuid, team_id uuid, team_name text, played bigint, wins bigint, losses bigint, points bigint, rank_position integer)
language sql
security definer
set search_path = public
as $$
  with all_round_matches as (
    select match.* from public.matches match where match.league_round_id = target_round_id
  ), round_matches as (
    select * from all_round_matches where status = 'completed'
  ), round_membership as (
    select distinct membership.group_id, membership.team_id
    from all_round_matches match
    cross join lateral (values (match.group_id, match.home_team_id), (match.group_id, match.away_team_id)) as membership(group_id, team_id)
    union
    select group_team.group_id, group_team.team_id
    from public.group_teams group_team
    where not exists (select 1 from all_round_matches)
  ), base as (
    select
      league_group.id as group_id,
      team.id as team_id,
      team.name as team_name,
      count(match.id) as played,
      count(match.id) filter (where (match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score)) as wins,
      count(match.id) filter (where (match.home_team_id = team.id and match.home_score < match.away_score) or (match.away_team_id = team.id and match.away_score < match.home_score)) as losses,
      coalesce(sum(
        case when match.home_team_id = team.id then match.home_score else match.away_score end
        + case
          when (match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score) then 2
          when match.walkover_winner_id is null then 1
          else 0
        end
      ), 0) as points
    from public.groups league_group
    join round_membership membership on membership.group_id = league_group.id
    join public.teams team on team.id = membership.team_id
    left join round_matches match on match.group_id = league_group.id and team.id in (match.home_team_id, match.away_team_id)
    group by league_group.id, team.id, team.name
  ), head_to_head as (
    select
      standing.group_id,
      standing.team_id,
      coalesce(sum(case when (match.home_team_id = standing.team_id and match.home_score > match.away_score) or (match.away_team_id = standing.team_id and match.away_score > match.home_score) then 1 else 0 end), 0) as wins,
      coalesce(sum(case when match.home_team_id = standing.team_id then match.home_score - match.away_score else match.away_score - match.home_score end), 0) as set_difference,
      coalesce(sum(case when match.home_team_id = standing.team_id then games.home_games - games.away_games else games.away_games - games.home_games end), 0) as game_difference
    from base standing
    join base opponent on opponent.group_id = standing.group_id and opponent.team_id <> standing.team_id and opponent.points = standing.points and opponent.played = standing.played
    left join round_matches match on match.group_id = standing.group_id and standing.team_id in (match.home_team_id, match.away_team_id) and opponent.team_id in (match.home_team_id, match.away_team_id)
    left join lateral (
      select coalesce(sum((set_score ->> 'home')::integer), 0) as home_games, coalesce(sum((set_score ->> 'away')::integer), 0) as away_games
      from jsonb_array_elements(coalesce(match.set_scores, '[]'::jsonb)) set_score
    ) games on true
    group by standing.group_id, standing.team_id
  )
  select
    base.group_id,
    base.team_id,
    base.team_name,
    base.played,
    base.wins,
    base.losses,
    base.points,
    row_number() over (
      partition by base.group_id
      order by base.points desc, base.played desc, head_to_head.wins desc, head_to_head.set_difference desc, head_to_head.game_difference desc, base.team_name
    )::integer as rank_position
  from base
  left join head_to_head on head_to_head.group_id = base.group_id and head_to_head.team_id = base.team_id;
$$;
