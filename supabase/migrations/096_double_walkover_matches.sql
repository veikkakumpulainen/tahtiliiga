-- Support recording a match where BOTH teams failed to play each other, as
-- distinct from a normal walkover (one team forfeits, the other still wins
-- and scores normally via walkover_winner_id). Recorded as 6-0, 0-6, 0-0 per
-- league convention, but kept out of the 'completed' status - every
-- standings/points function already sums only status = 'completed' matches,
-- so this alone keeps such a match from giving either team points or
-- counting as played, with no changes needed to the standings functions.
-- Admin-only, since a captain shouldn't be able to unilaterally zero out an
-- opponent's (or their own) match.

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'double_walkover'));

create or replace function public.save_match_details(
  target_match_id uuid, target_scheduled_at timestamptz, target_venue text, target_home_score integer, target_away_score integer,
  target_set_scores jsonb, target_walkover_winner_id uuid, target_status text, requested_home_lineup uuid[], requested_away_lineup uuid[],
  requested_home_substitute_id uuid, requested_away_substitute_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_match public.matches%rowtype;
  final_home_lineup uuid[];
  final_away_lineup uuid[];
  final_home_substitute_id uuid;
  final_away_substitute_id uuid;
  final_home_approved_by uuid;
  final_away_approved_by uuid;
begin
  select * into current_match from public.matches where id = target_match_id;
  if not found or not (public.is_admin() or public.is_team_member(current_match.home_team_id) or public.is_team_member(current_match.away_team_id)) then raise exception 'Not allowed to update this match'; end if;

  if target_status = 'double_walkover' and not public.is_admin() then
    raise exception 'Only admins can mark a match as unplayed by both teams';
  end if;

  final_home_lineup := array_remove(array[current_match.home_player_one_id, current_match.home_player_two_id], null);
  final_away_lineup := array_remove(array[current_match.away_player_one_id, current_match.away_player_two_id], null);
  final_home_substitute_id := current_match.home_substitute_player_id;
  final_away_substitute_id := current_match.away_substitute_player_id;
  final_home_approved_by := current_match.home_substitute_approved_by;
  final_away_approved_by := current_match.away_substitute_approved_by;

  if target_status = 'double_walkover' then
    final_home_lineup := array[]::uuid[];
    final_away_lineup := array[]::uuid[];
  elsif public.is_admin() or public.is_team_member(current_match.home_team_id) then
    final_home_lineup := requested_home_lineup;
    final_home_substitute_id := requested_home_substitute_id;
    if requested_home_substitute_id is distinct from current_match.home_substitute_player_id then final_home_approved_by := null; end if;
  end if;
  if target_status <> 'double_walkover' and (public.is_admin() or public.is_team_member(current_match.away_team_id)) then
    final_away_lineup := requested_away_lineup;
    final_away_substitute_id := requested_away_substitute_id;
    if requested_away_substitute_id is distinct from current_match.away_substitute_player_id then final_away_approved_by := null; end if;
  end if;

  if target_status = 'completed' and target_walkover_winner_id is null and (
    (final_home_substitute_id is not null and final_home_approved_by is null)
    or (final_away_substitute_id is not null and final_away_approved_by is null)
  ) then raise exception 'The opposing team must approve every substitute before recording the result'; end if;

  update public.matches set
    scheduled_at = target_scheduled_at, venue = nullif(btrim(target_venue), ''), home_score = target_home_score, away_score = target_away_score,
    set_scores = target_set_scores, walkover_winner_id = target_walkover_winner_id, status = target_status,
    home_player_one_id = final_home_lineup[1], home_player_two_id = final_home_lineup[2], away_player_one_id = final_away_lineup[1], away_player_two_id = final_away_lineup[2],
    home_substitute_player_id = final_home_substitute_id, away_substitute_player_id = final_away_substitute_id,
    home_substitute_approved_by = final_home_approved_by, away_substitute_approved_by = final_away_approved_by
  where id = target_match_id;
end;
$$;

revoke all on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[], uuid, uuid) from public;
grant execute on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[], uuid, uuid) to authenticated;
