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
  limit 5;
$$;
