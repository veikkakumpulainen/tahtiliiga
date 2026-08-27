-- Show the league's schedule (start/end date) on the invite card so a
-- player can judge the invitation before it's even accepted.

drop function if exists public.get_pending_team_invitations();

create or replace function public.get_pending_team_invitations()
returns table (team_id uuid, team_name text, league_id uuid, league_name text, captain_name text, league_start_date date, league_end_date date)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, league.id, league.name, nullif(concat_ws(' ', captain.first_name, captain.last_name), ''), league.start_date, league.end_date
  from public.team_members membership
  join public.teams team on team.id = membership.team_id
  join public.leagues league on league.id = team.league_id
  left join public.profiles captain on captain.id = team.captain_id
  where membership.user_id = auth.uid() and membership.status = 'pending';
$$;

revoke all on function public.get_pending_team_invitations() from public;
grant execute on function public.get_pending_team_invitations() to authenticated;
