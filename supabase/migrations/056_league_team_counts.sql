create or replace function public.get_league_team_counts(target_league_ids uuid[])
returns table (league_id uuid, team_count bigint)
language sql
security definer
set search_path = public
as $$
  select team.league_id, count(*)
  from public.teams team
  where auth.uid() is not null
    and team.league_id = any(target_league_ids)
  group by team.league_id;
$$;

revoke all on function public.get_league_team_counts(uuid[]) from public;
grant execute on function public.get_league_team_counts(uuid[]) to authenticated;
