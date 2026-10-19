-- The app now lets a player pick which league to view from the header, so
-- profiles.city_id is only a home city (the default view and sign-up
-- choice). The city lock and the automatic city moves from
-- 122_cities.sql existed to keep the viewed city and the player's own
-- league in sync, and are no longer needed.

drop trigger if exists profile_city_locked_during_league on public.profiles;
drop trigger if exists team_member_sync_city on public.team_members;
drop trigger if exists league_city_sync_members on public.leagues;

drop function if exists public.prevent_city_change_during_league();
drop function if exists public.sync_player_city_on_team_join();
drop function if exists public.sync_member_cities_on_league_city_change();
drop function if exists public.in_unfinished_league_outside_city(uuid, uuid, uuid);
