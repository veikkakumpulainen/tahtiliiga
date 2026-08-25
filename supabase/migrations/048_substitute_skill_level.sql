drop function if exists public.get_active_team_matches(uuid);
create function public.get_active_team_matches(target_team_id uuid)
returns table (id uuid, home_team_id uuid, away_team_id uuid, home_team_name text, away_team_name text, home_score integer, away_score integer, status text, scheduled_at timestamptz, venue text, set_scores jsonb, walkover_winner_id uuid, round_type text, home_substitute_player_id uuid, away_substitute_player_id uuid, home_substitute_name text, away_substitute_name text, home_substitute_skill_level text, away_substitute_skill_level text, home_substitute_approved boolean, away_substitute_approved boolean)
language sql security definer set search_path = public as $$
  select match.id, match.home_team_id, match.away_team_id, home_team.name, away_team.name, match.home_score, match.away_score, match.status, match.scheduled_at, match.venue, match.set_scores, match.walkover_winner_id, round.round_type, match.home_substitute_player_id, match.away_substitute_player_id, concat_ws(' ', home_sub.first_name, home_sub.last_name), concat_ws(' ', away_sub.first_name, away_sub.last_name), home_sub.skill_level, away_sub.skill_level, match.home_substitute_approved_by is not null, match.away_substitute_approved_by is not null
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.teams home_team on home_team.id = match.home_team_id
  join public.teams away_team on away_team.id = match.away_team_id
  left join public.profiles home_sub on home_sub.id = match.home_substitute_player_id
  left join public.profiles away_sub on away_sub.id = match.away_substitute_player_id
  where target_team_id in (match.home_team_id, match.away_team_id) and (public.is_admin() or public.is_team_member(target_team_id));
$$;

revoke all on function public.get_active_team_matches(uuid) from public;
grant execute on function public.get_active_team_matches(uuid) to authenticated;
