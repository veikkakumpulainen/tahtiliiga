alter table public.matches
  add column if not exists home_substitute_player_id uuid references public.profiles(id),
  add column if not exists away_substitute_player_id uuid references public.profiles(id);

create or replace function public.validate_match_lineup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.home_player_one_id is null) <> (new.home_player_two_id is null)
    or (new.away_player_one_id is null) <> (new.away_player_two_id is null) then
    raise exception 'A match lineup must contain exactly two players per selected team';
  end if;

  if new.home_substitute_player_id is not null and new.home_substitute_player_id not in (new.home_player_one_id, new.home_player_two_id) then
    raise exception 'The home substitute must be selected in the playing pair';
  end if;
  if new.away_substitute_player_id is not null and new.away_substitute_player_id not in (new.away_player_one_id, new.away_player_two_id) then
    raise exception 'The away substitute must be selected in the playing pair';
  end if;

  if new.home_player_one_id is not null and (
    new.home_player_one_id = new.home_player_two_id
    or (new.home_player_one_id is distinct from new.home_substitute_player_id and not exists (select 1 from public.team_members where team_id = new.home_team_id and user_id = new.home_player_one_id))
    or (new.home_player_two_id is distinct from new.home_substitute_player_id and not exists (select 1 from public.team_members where team_id = new.home_team_id and user_id = new.home_player_two_id))
  ) then
    raise exception 'Home lineup players must belong to the team or be its selected substitute';
  end if;

  if new.away_player_one_id is not null and (
    new.away_player_one_id = new.away_player_two_id
    or (new.away_player_one_id is distinct from new.away_substitute_player_id and not exists (select 1 from public.team_members where team_id = new.away_team_id and user_id = new.away_player_one_id))
    or (new.away_player_two_id is distinct from new.away_substitute_player_id and not exists (select 1 from public.team_members where team_id = new.away_team_id and user_id = new.away_player_two_id))
  ) then
    raise exception 'Away lineup players must belong to the team or be its selected substitute';
  end if;
  return new;
end;
$$;

drop trigger if exists match_lineup_valid on public.matches;
create trigger match_lineup_valid
before insert or update of home_player_one_id, home_player_two_id, away_player_one_id, away_player_two_id, home_substitute_player_id, away_substitute_player_id on public.matches
for each row execute function public.validate_match_lineup();

drop function if exists public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[]);
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
begin
  select * into current_match from public.matches where id = target_match_id;
  if not found or not (public.is_admin() or public.is_team_member(current_match.home_team_id) or public.is_team_member(current_match.away_team_id)) then raise exception 'Not allowed to update this match'; end if;

  final_home_lineup := array_remove(array[current_match.home_player_one_id, current_match.home_player_two_id], null);
  final_away_lineup := array_remove(array[current_match.away_player_one_id, current_match.away_player_two_id], null);
  final_home_substitute_id := current_match.home_substitute_player_id;
  final_away_substitute_id := current_match.away_substitute_player_id;

  if public.is_admin() or public.is_team_member(current_match.home_team_id) then final_home_lineup := requested_home_lineup; final_home_substitute_id := requested_home_substitute_id; end if;
  if public.is_admin() or public.is_team_member(current_match.away_team_id) then final_away_lineup := requested_away_lineup; final_away_substitute_id := requested_away_substitute_id; end if;

  update public.matches set
    scheduled_at = target_scheduled_at, venue = nullif(btrim(target_venue), ''), home_score = target_home_score, away_score = target_away_score,
    set_scores = target_set_scores, walkover_winner_id = target_walkover_winner_id, status = target_status,
    home_player_one_id = final_home_lineup[1], home_player_two_id = final_home_lineup[2], away_player_one_id = final_away_lineup[1], away_player_two_id = final_away_lineup[2],
    home_substitute_player_id = final_home_substitute_id, away_substitute_player_id = final_away_substitute_id
  where id = target_match_id;
end;
$$;

create or replace function public.search_match_substitutes(target_match_id uuid, target_team_id uuid, search_query text)
returns table (id uuid, first_name text, last_name text)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.profiles profile on true
  where match.id = target_match_id
    and target_team_id in (match.home_team_id, match.away_team_id)
    and (public.is_admin() or public.is_team_member(target_team_id))
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
  order by profile.first_name, profile.last_name
  limit 10;
$$;

revoke all on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[], uuid, uuid) from public;
revoke all on function public.search_match_substitutes(uuid, uuid, text) from public;
grant execute on function public.save_match_details(uuid, timestamptz, text, integer, integer, jsonb, uuid, text, uuid[], uuid[], uuid, uuid) to authenticated;
grant execute on function public.search_match_substitutes(uuid, uuid, text) to authenticated;