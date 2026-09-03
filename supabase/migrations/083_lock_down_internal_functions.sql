-- Supabase Security Advisor flags every SECURITY DEFINER function reachable
-- via PostgREST (anon/authenticated), including trigger-only functions that
-- Postgres already refuses to call outside a trigger context ("trigger
-- functions can only be called as triggers"). They're not exploitable, but
-- there's no reason for them to be part of the public API surface either.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.assign_registered_teams_to_groups() from anon, authenticated;
revoke execute on function public.disable_automatic_group_allocation_after_manual_group_change() from anon, authenticated;
revoke execute on function public.prevent_duplicate_league_team_member() from anon, authenticated;
revoke execute on function public.require_lineups_for_completed_match() from anon, authenticated;
revoke execute on function public.validate_match_lineup() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- Player search moved to name + player_code (see 079_player_codes.sql);
-- find_profile_by_email is unused dead code and an email-enumeration
-- surface, so drop it instead of just revoking access.
drop function if exists public.find_profile_by_email(text);
