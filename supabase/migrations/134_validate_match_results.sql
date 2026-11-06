-- save_match_details trusted the result checks in the app: a direct RPC call
-- could record an impossible result (9-0 without sets, a 1-1 draw) or change
-- a match after its round had been completed. Validate the result here with
-- the same rules as the app (GroupMatches.tsx), and let only admins change
-- a match once its round is completed.
--
-- Regular round: all three sets are played, each 6-0..6-4, 7-5 or 7-6 with
-- tiebreak points (winner at least 7, two points ahead), and the match score
-- is the sets won. A walkover is recorded 3-0 for its winner.
-- Qualification: only the winner matters - either 1-0 without sets (as the
-- app records it, walkover too), or by sets, where 2-0 ends the match and
-- 2-1 needs the third set.

create or replace function public.is_valid_padel_set(set_score jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  home_games integer;
  away_games integer;
  high integer;
  low integer;
  tiebreak boolean := coalesce((set_score ->> 'tiebreak')::boolean, false);
  home_tiebreak integer;
  away_tiebreak integer;
begin
  if jsonb_typeof(set_score -> 'home') <> 'number' or jsonb_typeof(set_score -> 'away') <> 'number' then return false; end if;
  home_games := (set_score ->> 'home')::integer;
  away_games := (set_score ->> 'away')::integer;
  high := greatest(home_games, away_games);
  low := least(home_games, away_games);
  if home_games = away_games or low < 0 then return false; end if;
  if high = 6 then return low <= 4 and not tiebreak; end if;
  if high <> 7 or not ((low = 5 and not tiebreak) or (low = 6 and tiebreak)) then return false; end if;
  if not tiebreak then return true; end if;
  if coalesce(set_score ->> 'homeTiebreak', '') !~ '^\d{1,3}$' or coalesce(set_score ->> 'awayTiebreak', '') !~ '^\d{1,3}$' then return false; end if;
  home_tiebreak := (set_score ->> 'homeTiebreak')::integer;
  away_tiebreak := (set_score ->> 'awayTiebreak')::integer;
  return (case when home_games = 7 then home_tiebreak else away_tiebreak end) >= 7
    and (case when home_games = 7 then home_tiebreak - away_tiebreak else away_tiebreak - home_tiebreak end) >= 2;
end;
$$;

-- Null when a completed result is valid, otherwise the reason it is not.
create or replace function public.match_result_error(
  target_round_type text, home_score integer, away_score integer, set_scores jsonb,
  walkover_winner_id uuid, home_team_id uuid, away_team_id uuid
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  set_count integer := case when jsonb_typeof(set_scores) = 'array' then jsonb_array_length(set_scores) else 0 end;
  home_sets integer;
  away_sets integer;
begin
  if home_score is null or away_score is null then return 'Tuloksesta puuttuu pisteet.'; end if;
  if home_score = away_score then return 'Ottelu ei voi päättyä tasan.'; end if;
  if walkover_winner_id is not null and walkover_winner_id <> (case when home_score > away_score then home_team_id else away_team_id end) then
    return 'Luovutusvoiton voittajan pitää olla ottelun voittaja.';
  end if;

  if target_round_type = 'qualification' and set_count = 0 then
    if greatest(home_score, away_score) = 1 and least(home_score, away_score) = 0 then return null; end if;
    return 'Karsintaottelusta kirjataan vain voittaja.';
  end if;

  if walkover_winner_id is not null then
    if target_round_type = 'regular' and greatest(home_score, away_score) = 3 and least(home_score, away_score) = 0 then return null; end if;
    return 'Luovutusvoitto kirjataan 3-0.';
  end if;

  if exists (select 1 from jsonb_array_elements(set_scores) set_score where not public.is_valid_padel_set(set_score)) then
    return 'Setti päättyy 6-0 - 6-4, 7-5 tai 7-6. Tiebreakiin merkitään myös pisteet, vähintään 7 ja kahden pisteen erolla.';
  end if;
  select count(*) filter (where (set_score ->> 'home')::integer > (set_score ->> 'away')::integer),
         count(*) filter (where (set_score ->> 'away')::integer > (set_score ->> 'home')::integer)
  into home_sets, away_sets
  from jsonb_array_elements(set_scores) set_score;
  if home_sets <> home_score or away_sets <> away_score then return 'Ottelun tulos ei vastaa settejä.'; end if;

  if target_round_type = 'qualification' then
    -- A third set is only played when the first two were split.
    if greatest(home_sets, away_sets) = 2 and (set_count = 2 or (set_count = 3
      and ((set_scores -> 0 ->> 'home')::integer > (set_scores -> 0 ->> 'away')::integer) <> ((set_scores -> 1 ->> 'home')::integer > (set_scores -> 1 ->> 'away')::integer))) then
      return null;
    end if;
    return 'Karsintaottelun voittaja voittaa kaksi settiä.';
  end if;
  if set_count <> 3 then return 'Kirjaa kaikki kolme settiä.'; end if;
  return null;
end;
$$;

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
  match_round public.league_rounds%rowtype;
  result_error text;
  final_home_lineup uuid[];
  final_away_lineup uuid[];
  final_home_substitute_id uuid;
  final_away_substitute_id uuid;
  final_home_approved_by uuid;
  final_away_approved_by uuid;
  match_category text;
  gender_1 text;
  gender_2 text;
begin
  select * into current_match from public.matches where id = target_match_id;
  if not found or not (public.is_admin() or public.is_team_member(current_match.home_team_id) or public.is_team_member(current_match.away_team_id)) then raise exception 'Not allowed to update this match'; end if;

  select * into match_round from public.league_rounds where id = current_match.league_round_id;
  if match_round.status = 'completed' and not public.is_admin() then
    raise exception 'Kierros on päättynyt. Vain ylläpito voi muuttaa ottelua.';
  end if;

  if target_status = 'double_walkover' and not public.is_admin() then
    raise exception 'Only admins can mark a match as unplayed by both teams';
  end if;

  if target_status = 'completed' then
    result_error := public.match_result_error(match_round.round_type, target_home_score, target_away_score, coalesce(target_set_scores, '[]'::jsonb),
      target_walkover_winner_id, current_match.home_team_id, current_match.away_team_id);
    if result_error is not null then raise exception '%', result_error; end if;
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

  select team.category into match_category from public.teams team where team.id = current_match.home_team_id;

  if match_category = 'mixty' then
    if array_length(final_home_lineup, 1) = 2 then
      select gender into gender_1 from public.profiles where id = final_home_lineup[1];
      select gender into gender_2 from public.profiles where id = final_home_lineup[2];
      if gender_1 is not null and gender_2 is not null and gender_1 = gender_2 then
        raise exception 'Mixty-ottelussa joukkueen pelaajaparin tulee olla mies ja nainen.';
      end if;
    end if;
    if array_length(final_away_lineup, 1) = 2 then
      select gender into gender_1 from public.profiles where id = final_away_lineup[1];
      select gender into gender_2 from public.profiles where id = final_away_lineup[2];
      if gender_1 is not null and gender_2 is not null and gender_1 = gender_2 then
        raise exception 'Mixty-ottelussa joukkueen pelaajaparin tulee olla mies ja nainen.';
      end if;
    end if;
  end if;

  update public.matches set
    scheduled_at = target_scheduled_at, venue = nullif(btrim(target_venue), ''), home_score = target_home_score, away_score = target_away_score,
    set_scores = target_set_scores, walkover_winner_id = target_walkover_winner_id, status = target_status,
    home_player_one_id = final_home_lineup[1], home_player_two_id = final_home_lineup[2], away_player_one_id = final_away_lineup[1], away_player_two_id = final_away_lineup[2],
    home_substitute_player_id = final_home_substitute_id, away_substitute_player_id = final_away_substitute_id,
    home_substitute_approved_by = final_home_approved_by, away_substitute_approved_by = final_away_approved_by
  where id = target_match_id;
end;
$$;

revoke all on function public.is_valid_padel_set(jsonb) from public, anon;
revoke all on function public.match_result_error(text, integer, integer, jsonb, uuid, uuid, uuid) from public, anon;
grant execute on function public.is_valid_padel_set(jsonb) to authenticated;
grant execute on function public.match_result_error(text, integer, integer, jsonb, uuid, uuid, uuid) to authenticated;
