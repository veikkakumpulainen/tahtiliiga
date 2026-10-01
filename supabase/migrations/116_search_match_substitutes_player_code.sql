-- Return player_code from the substitute search so the lineup picker can
-- tell apart players with the same name (same "Name · #code" format as the
-- team registration search in 084_search_players_scoped_by_category.sql).
-- The return type changes, so the function must be dropped and recreated.
drop function if exists public.search_match_substitutes(uuid, uuid, text);

create function public.search_match_substitutes(target_match_id uuid, target_team_id uuid, search_query text)
returns table (id uuid, first_name text, last_name text, gender text, player_code integer)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.gender, profile.player_code
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

revoke all on function public.search_match_substitutes(uuid, uuid, text) from public;
grant execute on function public.search_match_substitutes(uuid, uuid, text) to authenticated;
