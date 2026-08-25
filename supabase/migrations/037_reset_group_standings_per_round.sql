create or replace function public.get_league_standings(target_league_id uuid)
returns table (
  group_id uuid,
  group_name text,
  team_id uuid,
  team_name text,
  played bigint,
  wins bigint,
  losses bigint,
  points bigint
)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select public.is_admin() or (
      exists (select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing')
      and exists (
        select 1 from public.team_members membership
        join public.teams member_team on member_team.id = membership.team_id
        where membership.user_id = auth.uid() and member_team.league_id = target_league_id
      )
    ) as allowed
  ), active_regular_round as (
    select id
    from public.league_rounds
    where league_id = target_league_id
      and round_type = 'regular'
      and status = 'active'
    order by start_date desc, created_at desc
    limit 1
  )
  select
    league_group.id,
    league_group.name,
    team.id,
    team.name,
    count(match.id) filter (where match.status = 'completed'),
    count(match.id) filter (where match.status = 'completed' and (
      (match.home_team_id = team.id and match.home_score > match.away_score)
      or (match.away_team_id = team.id and match.away_score > match.home_score)
    )),
    count(match.id) filter (where match.status = 'completed' and (
      (match.home_team_id = team.id and match.home_score < match.away_score)
      or (match.away_team_id = team.id and match.away_score < match.home_score)
    )),
    coalesce(sum(case
      when match.status <> 'completed' then 0
      else case when match.home_team_id = team.id then match.home_score else match.away_score end
        + case
          when (match.home_team_id = team.id and match.home_score > match.away_score)
            or (match.away_team_id = team.id and match.away_score > match.home_score) then 2
          when match.walkover_winner_id is null then 1
          else 0
        end
    end), 0) as points
  from authorized
  join public.groups league_group on league_group.league_id = target_league_id
  join public.group_teams group_team on group_team.group_id = league_group.id
  join public.teams team on team.id = group_team.team_id
  left join public.matches match on match.group_id = league_group.id
    and match.league_round_id = (select id from active_regular_round)
    and team.id in (match.home_team_id, match.away_team_id)
  where authorized.allowed
  group by league_group.id, league_group.name, team.id, team.name;
$$;

revoke all on function public.get_league_standings(uuid) from public;
grant execute on function public.get_league_standings(uuid) to authenticated;