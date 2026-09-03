-- A player can have one team in avoin AND a separate team in mixty within
-- the same league (see 078_one_team_per_league_category.sql), but the
-- player search excluded anyone already on ANY team in the league,
-- regardless of category - so a player already on an avoin team could never
-- be found while building a mixty team. Scope the exclusion by category.
drop function if exists public.search_profiles_by_name(text, uuid);

create or replace function public.search_profiles_by_name(search_query text, target_league_id uuid, target_category text)
returns table (id uuid, first_name text, last_name text, player_code integer)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.player_code
  from public.profiles profile
  where auth.uid() is not null
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
    and not exists (
      select 1
      from public.team_members membership
      join public.teams team on team.id = membership.team_id
      where membership.user_id = profile.id
        and team.league_id = target_league_id
        and team.category = target_category
    )
  order by profile.first_name, profile.last_name
  limit 5;
$$;

revoke all on function public.search_profiles_by_name(text, uuid, text) from public;
grant execute on function public.search_profiles_by_name(text, uuid, text) to authenticated;
