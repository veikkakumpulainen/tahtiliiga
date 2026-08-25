create table if not exists public.league_round_bonus_points (
  league_round_id uuid not null references public.league_rounds(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  points integer not null default 2 check (points > 0),
  primary key (league_round_id, team_id)
);

create or replace function public.get_regular_round_group_rankings(target_round_id uuid)
returns table (
  group_id uuid,
  team_id uuid,
  team_name text,
  played bigint,
  wins bigint,
  losses bigint,
  points bigint,
  rank_position integer
)
language sql
security definer
set search_path = public
as $$
  with round_matches as (
    select match.*
    from public.matches match
    where match.league_round_id = target_round_id
      and match.status = 'completed'
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
    join public.group_teams group_team on group_team.group_id = league_group.id
    join public.teams team on team.id = group_team.team_id
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

create or replace function public.complete_league_round(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  target_round_type text;
  qualification_match record;
  lower_group_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can complete rounds'; end if;
  select league_id, round_type into target_league_id, target_round_type from public.league_rounds where id = target_round_id and status = 'active';
  if target_league_id is null then raise exception 'The round is not active'; end if;
  if exists (select 1 from public.matches where league_round_id = target_round_id and status <> 'completed') then raise exception 'Complete every match before ending the round'; end if;

  if target_round_type = 'regular' then
    insert into public.league_round_bonus_points (league_round_id, team_id, points)
    select target_round_id, team_id, 2
    from public.get_regular_round_group_rankings(target_round_id)
    where rank_position = 1
    on conflict (league_round_id, team_id) do nothing;
  else
    for qualification_match in select id, group_id, home_team_id, away_team_id from public.matches where league_round_id = target_round_id and away_score > home_score loop
      select group_id into lower_group_id from public.group_teams where team_id = qualification_match.away_team_id;
      if lower_group_id is null then raise exception 'Qualification teams must remain in their current groups until the round is completed'; end if;
      delete from public.group_teams where team_id in (qualification_match.home_team_id, qualification_match.away_team_id);
      insert into public.group_teams (group_id, team_id) values (qualification_match.group_id, qualification_match.away_team_id), (lower_group_id, qualification_match.home_team_id);
    end loop;
  end if;

  update public.league_rounds set status = 'completed' where id = target_round_id;
end;
$$;

create or replace function public.start_qualification_round(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  target_round_start_date date;
  source_round_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can start rounds'; end if;
  select league_id, start_date into target_league_id, target_round_start_date from public.league_rounds where id = target_round_id and round_type = 'qualification' and status = 'draft';
  if target_league_id is null then raise exception 'The qualification round is not available to start'; end if;
  if exists (select 1 from public.league_rounds where league_id = target_league_id and id <> target_round_id and end_date <= target_round_start_date and status <> 'completed') then raise exception 'Complete the earlier scheduled round before starting this round'; end if;
  if exists (select 1 from public.league_rounds where league_id = target_league_id and status = 'active') then raise exception 'Complete the active round before starting another round'; end if;

  select id into source_round_id from public.league_rounds where league_id = target_league_id and round_type = 'regular' and status = 'completed' and end_date <= target_round_start_date order by end_date desc, created_at desc limit 1;
  if source_round_id is null then raise exception 'Complete a regular round before starting qualification'; end if;

  with numbered_groups as (
    select id, (regexp_match(name, '^Lohko ([0-9]+)$'))[1]::integer as group_number
    from public.groups where league_id = target_league_id
  )
  insert into public.matches (league_id, league_round_id, group_id, home_team_id, away_team_id, status)
  select target_league_id, target_round_id, upper_group.id, upper_third.team_id, lower_second.team_id, 'scheduled'
  from numbered_groups upper_group
  join numbered_groups lower_group on lower_group.group_number = upper_group.group_number + 1
  join public.get_regular_round_group_rankings(source_round_id) upper_third on upper_third.group_id = upper_group.id and upper_third.rank_position = 3
  join public.get_regular_round_group_rankings(source_round_id) lower_second on lower_second.group_id = lower_group.id and lower_second.rank_position = 2
  where upper_group.group_number is not null;

  update public.league_rounds set status = 'active' where id = target_round_id;
end;
$$;

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
    select public.is_admin() or (
      exists (select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing')
      and exists (select 1 from public.team_members membership join public.teams member_team on member_team.id = membership.team_id where membership.user_id = auth.uid() and member_team.league_id = target_league_id)
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
grant execute on function public.get_league_standings_with_tiebreakers(uuid) to authenticated;
grant execute on function public.get_league_total_standings(uuid) to authenticated;