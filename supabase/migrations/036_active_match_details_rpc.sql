create or replace function public.get_active_team_matches(target_team_id uuid)
returns table (
  id uuid,
  home_team_id uuid,
  away_team_id uuid,
  home_team_name text,
  away_team_name text,
  home_score integer,
  away_score integer,
  status text,
  scheduled_at timestamptz,
  venue text,
  set_scores jsonb,
  walkover_winner_id uuid,
  round_type text
)
language sql
security definer
set search_path = public
as $$
  select
    match.id,
    match.home_team_id,
    match.away_team_id,
    home_team.name,
    away_team.name,
    match.home_score,
    match.away_score,
    match.status,
    match.scheduled_at,
    match.venue,
    match.set_scores,
    match.walkover_winner_id,
    round.round_type
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.teams home_team on home_team.id = match.home_team_id
  join public.teams away_team on away_team.id = match.away_team_id
  where target_team_id in (match.home_team_id, match.away_team_id)
    and (public.is_admin() or public.is_team_member(target_team_id));
$$;

revoke all on function public.get_active_team_matches(uuid) from public;
grant execute on function public.get_active_team_matches(uuid) to authenticated;