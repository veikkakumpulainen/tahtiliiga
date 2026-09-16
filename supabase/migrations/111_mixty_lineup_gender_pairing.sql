-- Mixty ("mixed doubles") requires each team's on-court pair to be one man
-- and one woman - already enforced at team-registration time
-- (077_team_categories.sql: a mixty team needs at least one of each), but
-- nothing stopped picking two same-gender players as the actual lineup for
-- a given match. Expose gender so the client can guide the picker, and
-- enforce it here too since the client check alone is bypassable via a
-- direct RPC call.

-- Adding a column changes the OUT-parameter row type, which `create or
-- replace function` refuses (42P13) - drop first.
drop function if exists public.get_active_match_lineup_options(uuid);

create function public.get_active_match_lineup_options(target_match_id uuid)
returns table (team_id uuid, player_id uuid, first_name text, last_name text, gender text)
language sql
security definer
set search_path = public
as $$
  select membership.team_id, profile.id, profile.first_name, profile.last_name, profile.gender
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.team_members membership on membership.team_id in (match.home_team_id, match.away_team_id) and membership.status = 'active'
  join public.profiles profile on profile.id = membership.user_id
  where match.id = target_match_id
    and (public.is_admin() or public.is_team_member(match.home_team_id) or public.is_team_member(match.away_team_id));
$$;

drop function if exists public.search_match_substitutes(uuid, uuid, text);

create function public.search_match_substitutes(target_match_id uuid, target_team_id uuid, search_query text)
returns table (id uuid, first_name text, last_name text, gender text)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.gender
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.profiles profile on profile.deleted_at is null
  where match.id = target_match_id
    and target_team_id in (match.home_team_id, match.away_team_id)
    and (public.is_admin() or public.is_team_member(target_team_id))
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
  order by profile.first_name, profile.last_name
  limit 5;
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

-- The two dropped-and-recreated functions above lose their grants on drop -
-- restore them (save_match_details kept its signature, so `create or
-- replace` preserved its existing grants automatically).
revoke all on function public.get_active_match_lineup_options(uuid) from public;
grant execute on function public.get_active_match_lineup_options(uuid) to authenticated;
revoke all on function public.search_match_substitutes(uuid, uuid, text) from public;
grant execute on function public.search_match_substitutes(uuid, uuid, text) to authenticated;
