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
    select public.is_admin()
      or (
        exists (
          select 1
          from public.leagues league
          where league.id = target_league_id
            and league.status = 'ongoing'
        )
        and exists (
          select 1
          from public.team_members membership
          join public.teams member_team on member_team.id = membership.team_id
          where membership.user_id = auth.uid()
            and member_team.league_id = target_league_id
        )
      ) as allowed
  )
  select
    league_group.id as group_id,
    league_group.name as group_name,
    team.id as team_id,
    team.name as team_name,
    count(completed_match.id) as played,
    count(completed_match.id) filter (
      where (completed_match.home_team_id = team.id and completed_match.home_score > completed_match.away_score)
         or (completed_match.away_team_id = team.id and completed_match.away_score > completed_match.home_score)
    ) as wins,
    count(completed_match.id) filter (
      where (completed_match.home_team_id = team.id and completed_match.home_score < completed_match.away_score)
         or (completed_match.away_team_id = team.id and completed_match.home_score > completed_match.away_score)
    ) as losses,
    coalesce(sum(
      case when completed_match.home_team_id = team.id then completed_match.home_score else completed_match.away_score end
      + case
          when (completed_match.home_team_id = team.id and completed_match.home_score > completed_match.away_score)
            or (completed_match.away_team_id = team.id and completed_match.away_score > completed_match.home_score) then 2
          when completed_match.walkover_winner_id is null then 1
          else 0
        end
    ), 0) as points
  from authorized
  join public.groups league_group on league_group.league_id = target_league_id
  join public.group_teams group_team on group_team.group_id = league_group.id
  join public.teams team on team.id = group_team.team_id
  left join public.matches completed_match on completed_match.group_id = league_group.id
    and completed_match.status = 'completed'
    and team.id in (completed_match.home_team_id, completed_match.away_team_id)
  where authorized.allowed
  group by league_group.id, league_group.name, team.id, team.name;
$$;

revoke all on function public.get_league_standings(uuid) from public;
grant execute on function public.get_league_standings(uuid) to authenticated;