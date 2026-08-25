create or replace function public.create_team_with_members(
  target_league_id uuid,
  team_name text,
  team_skill_level text,
  team_skill_description text,
  target_captain_id uuid,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team_id uuid;
begin
  if auth.uid() is null or cardinality(member_ids) not between 2 and 3
    or target_captain_id <> all(member_ids)
    or (not public.is_admin() and auth.uid() <> all(member_ids)) then
    raise exception 'Invalid team members or captain';
  end if;

  if (select count(distinct member_id) from unnest(member_ids) as member_id) <> cardinality(member_ids) then
    raise exception 'A player can only be added once';
  end if;

  insert into public.teams (league_id, name, skill_level, skill_description, captain_id, created_by)
  values (target_league_id, btrim(team_name), team_skill_level, nullif(btrim(team_skill_description), ''), target_captain_id, auth.uid())
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, is_captain)
  select new_team_id, member_id, member_id = target_captain_id
  from unnest(member_ids) as member_id;

  return new_team_id;
end;
$$;

create or replace function public.save_match_details(
  target_match_id uuid,
  target_scheduled_at timestamptz,
  target_venue text,
  target_home_score integer,
  target_away_score integer,
  target_set_scores jsonb,
  target_walkover_winner_id uuid,
  target_status text,
  requested_home_lineup uuid[],
  requested_away_lineup uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_match public.matches%rowtype;
  home_member_count integer;
  away_member_count integer;
  final_home_lineup uuid[];
  final_away_lineup uuid[];
begin
  select * into current_match
  from public.matches
  where id = target_match_id;

  if not found or not (public.is_admin() or public.is_team_member(current_match.home_team_id) or public.is_team_member(current_match.away_team_id)) then
    raise exception 'Not allowed to update this match';
  end if;

  final_home_lineup := array_remove(array[current_match.home_player_one_id, current_match.home_player_two_id], null);
  final_away_lineup := array_remove(array[current_match.away_player_one_id, current_match.away_player_two_id], null);

  if public.is_admin() or public.is_team_member(current_match.home_team_id) then
    final_home_lineup := requested_home_lineup;
  end if;
  if public.is_admin() or public.is_team_member(current_match.away_team_id) then
    final_away_lineup := requested_away_lineup;
  end if;

  if cardinality(final_home_lineup) not in (0, 2) or cardinality(final_away_lineup) not in (0, 2) then
    raise exception 'A lineup must contain exactly two players';
  end if;

  select count(*) into home_member_count from public.team_members where team_id = current_match.home_team_id;
  select count(*) into away_member_count from public.team_members where team_id = current_match.away_team_id;
  if target_status = 'completed' and (
    (home_member_count > 2 and cardinality(final_home_lineup) <> 2)
    or (away_member_count > 2 and cardinality(final_away_lineup) <> 2)
  ) then
    raise exception 'Select the playing pair for every team with more than two members before recording the result';
  end if;

  update public.matches
  set
    scheduled_at = target_scheduled_at,
    venue = nullif(btrim(target_venue), ''),
    home_score = target_home_score,
    away_score = target_away_score,
    set_scores = target_set_scores,
    walkover_winner_id = target_walkover_winner_id,
    status = target_status,
    home_player_one_id = final_home_lineup[1],
    home_player_two_id = final_home_lineup[2],
    away_player_one_id = final_away_lineup[1],
    away_player_two_id = final_away_lineup[2]
  where id = target_match_id;
end;
$$;

drop policy if exists "own team members can update matches" on public.matches;

revoke all on function public.create_team_with_members(uuid, text, text, text, uuid, uuid[]) from public;
revoke all on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[]) from public;
grant execute on function public.create_team_with_members(uuid, text, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[]) to authenticated;