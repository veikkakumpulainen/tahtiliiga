-- Allow anonymous visitors to browse tournaments (leagues, rosters, standings)
-- without an account. Registering a team still requires authentication --
-- only select-side grants/policies change here, no write access is opened up.

grant usage on schema public to anon;

grant select on public.leagues to anon;
drop policy if exists "anyone can read leagues" on public.leagues;
create policy "anyone can read leagues" on public.leagues for select to anon using (true);

create or replace function public.get_league_team_counts(target_league_ids uuid[])
returns table (league_id uuid, team_count bigint)
language sql
security definer
set search_path = public
as $$
  select team.league_id, count(*)
  from public.teams team
  where team.league_id = any(target_league_ids)
  group by team.league_id;
$$;

revoke all on function public.get_league_team_counts(uuid[]) from public;
grant execute on function public.get_league_team_counts(uuid[]) to authenticated, anon;

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
  where team.league_id = target_league_id
  order by team.name, (profile.id = team.captain_id) desc, membership.status, profile.first_name, profile.last_name;
$$;

revoke all on function public.get_league_team_rosters(uuid) from public;
grant execute on function public.get_league_team_rosters(uuid) to authenticated, anon;

create or replace function public.get_league_teams(target_league_id uuid)
returns table (id uuid, name text, skill_level text)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, team.skill_level
  from public.teams team
  where team.league_id = target_league_id
  order by team.name;
$$;

revoke all on function public.get_league_teams(uuid) from public;
grant execute on function public.get_league_teams(uuid) to authenticated, anon;

create or replace function public.get_league_standings_with_tiebreakers(target_league_id uuid)
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
  )
  select ranking.group_id, league_group.name, ranking.team_id, ranking.team_name, ranking.played, ranking.wins, ranking.losses, ranking.points, ranking.rank_position
  from authorized
  join active_round on true
  join public.get_regular_round_group_rankings(active_round.id) ranking on true
  join public.groups league_group on league_group.id = ranking.group_id
  where authorized.allowed;
$$;

create or replace function public.get_league_total_standings(target_league_id uuid)
returns table (team_id uuid, team_name text, played bigint, wins bigint, losses bigint, points bigint)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select public.is_admin() or exists (
      select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing'
    ) as allowed
  )
  select
    team.id,
    team.name,
    count(match.id) filter (where match.status = 'completed'),
    count(match.id) filter (where match.status = 'completed' and ((match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score))),
    count(match.id) filter (where match.status = 'completed' and ((match.home_team_id = team.id and match.home_score < match.away_score) or (match.away_team_id = team.id and match.away_score < match.home_score))),
    coalesce(sum(case
      when match.status <> 'completed' then 0
      when round.round_type = 'qualification' and ((match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score)) then 1
      when round.round_type = 'qualification' then 0
      else case when match.home_team_id = team.id then match.home_score else match.away_score end + case when (match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score) then 2 when match.walkover_winner_id is null then 1 else 0 end
    end), 0) + coalesce((select sum(bonus.points) from public.league_round_bonus_points bonus where bonus.team_id = team.id), 0) as points
  from authorized
  join public.teams team on team.league_id = target_league_id
  left join public.matches match on match.league_id = target_league_id and team.id in (match.home_team_id, match.away_team_id)
  left join public.league_rounds round on round.id = match.league_round_id
  where authorized.allowed
  group by team.id, team.name;
$$;

revoke all on function public.get_league_standings_with_tiebreakers(uuid) from public;
revoke all on function public.get_league_total_standings(uuid) from public;
grant execute on function public.get_league_standings_with_tiebreakers(uuid) to authenticated, anon;
grant execute on function public.get_league_total_standings(uuid) to authenticated, anon;
