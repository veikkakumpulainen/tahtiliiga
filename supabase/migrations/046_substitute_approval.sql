alter table public.matches
  add column if not exists home_substitute_approved_by uuid references public.profiles(id),
  add column if not exists away_substitute_approved_by uuid references public.profiles(id);

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

  final_home_lineup := array_remove(array[current_match.home_player_one_id, current_match.home_player_two_id], null);
  final_away_lineup := array_remove(array[current_match.away_player_one_id, current_match.away_player_two_id], null);
  final_home_substitute_id := current_match.home_substitute_player_id;
  final_away_substitute_id := current_match.away_substitute_player_id;
  final_home_approved_by := current_match.home_substitute_approved_by;
  final_away_approved_by := current_match.away_substitute_approved_by;

  if public.is_admin() or public.is_team_member(current_match.home_team_id) then
    final_home_lineup := requested_home_lineup;
    final_home_substitute_id := requested_home_substitute_id;
    if requested_home_substitute_id is distinct from current_match.home_substitute_player_id then final_home_approved_by := null; end if;
  end if;
  if public.is_admin() or public.is_team_member(current_match.away_team_id) then
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

create or replace function public.approve_match_substitute(target_match_id uuid, substitute_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_match public.matches%rowtype;
begin
  select * into current_match from public.matches where id = target_match_id;
  if not found then raise exception 'Match not found'; end if;
  if public.is_admin() then
    null;
  elsif substitute_team_id = current_match.home_team_id and not public.is_team_member(current_match.away_team_id) then
    raise exception 'Only the opposing team can approve a substitute';
  elsif substitute_team_id = current_match.away_team_id and not public.is_team_member(current_match.home_team_id) then
    raise exception 'Only the opposing team can approve a substitute';
  end if;

  if substitute_team_id = current_match.home_team_id and current_match.home_substitute_player_id is not null then
    update public.matches set home_substitute_approved_by = auth.uid() where id = target_match_id;
  elsif substitute_team_id = current_match.away_team_id and current_match.away_substitute_player_id is not null then
    update public.matches set away_substitute_approved_by = auth.uid() where id = target_match_id;
  else
    raise exception 'No substitute is awaiting approval for this team';
  end if;
end;
$$;

create or replace function public.require_lineups_for_completed_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare home_member_count integer; away_member_count integer;
begin
  if new.status <> 'completed' or new.walkover_winner_id is not null then return new; end if;
  select count(*) into home_member_count from public.team_members where team_id = new.home_team_id;
  select count(*) into away_member_count from public.team_members where team_id = new.away_team_id;
  if (home_member_count > 2 and (new.home_player_one_id is null or new.home_player_two_id is null)) or (away_member_count > 2 and (new.away_player_one_id is null or new.away_player_two_id is null)) then raise exception 'Select the playing pair for every team with more than two members before recording the result'; end if;
  if (new.home_substitute_player_id is not null and new.home_substitute_approved_by is null) or (new.away_substitute_player_id is not null and new.away_substitute_approved_by is null) then raise exception 'The opposing team must approve every substitute before recording the result'; end if;
  return new;
end;
$$;

drop function if exists public.get_active_team_matches(uuid);
create function public.get_active_team_matches(target_team_id uuid)
returns table (id uuid, home_team_id uuid, away_team_id uuid, home_team_name text, away_team_name text, home_score integer, away_score integer, status text, scheduled_at timestamptz, venue text, set_scores jsonb, walkover_winner_id uuid, round_type text, home_substitute_player_id uuid, away_substitute_player_id uuid, home_substitute_name text, away_substitute_name text, home_substitute_approved boolean, away_substitute_approved boolean)
language sql security definer set search_path = public as $$
  select match.id, match.home_team_id, match.away_team_id, home_team.name, away_team.name, match.home_score, match.away_score, match.status, match.scheduled_at, match.venue, match.set_scores, match.walkover_winner_id, round.round_type, match.home_substitute_player_id, match.away_substitute_player_id, concat_ws(' ', home_sub.first_name, home_sub.last_name), concat_ws(' ', away_sub.first_name, away_sub.last_name), match.home_substitute_approved_by is not null, match.away_substitute_approved_by is not null
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.teams home_team on home_team.id = match.home_team_id
  join public.teams away_team on away_team.id = match.away_team_id
  left join public.profiles home_sub on home_sub.id = match.home_substitute_player_id
  left join public.profiles away_sub on away_sub.id = match.away_substitute_player_id
  where target_team_id in (match.home_team_id, match.away_team_id) and (public.is_admin() or public.is_team_member(target_team_id));
$$;

revoke all on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[], uuid, uuid) from public;
revoke all on function public.approve_match_substitute(uuid, uuid) from public;
revoke all on function public.get_active_team_matches(uuid) from public;
grant execute on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[], uuid, uuid) to authenticated;
grant execute on function public.approve_match_substitute(uuid, uuid) to authenticated;
grant execute on function public.get_active_team_matches(uuid) to authenticated;