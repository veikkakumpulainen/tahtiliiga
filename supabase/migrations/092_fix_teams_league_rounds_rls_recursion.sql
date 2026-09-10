-- "participants can read league rounds" (025_league_rounds.sql) reads
-- team_members and teams directly in its USING clause, unlike every other
-- cross-table RLS check in this schema (which goes through a security
-- definer helper such as is_team_member/is_team_participant). Once teams
-- gained its own policy that reads league_rounds in turn
-- (035_active_match_opponent_visibility.sql's "users can read active match
-- opponents"), the two policies formed a cycle - teams -> league_rounds ->
-- teams -> ... - which Postgres reports as "infinite recursion detected in
-- policy for relation teams" on every single read of teams or league_rounds.
--
-- Fix: move the check into a security definer function (owned by postgres,
-- which bypasses RLS), exactly like is_team_member/is_team_participant. This
-- keeps the same visibility rule but breaks the recursive cycle.

create or replace function public.is_league_participant(target_league_id uuid)
returns boolean language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members membership
    join public.teams team on team.id = membership.team_id
    where membership.user_id = auth.uid() and team.league_id = target_league_id
  );
$$;

revoke all on function public.is_league_participant(uuid) from public;
grant execute on function public.is_league_participant(uuid) to authenticated;

drop policy if exists "participants can read league rounds" on public.league_rounds;
create policy "participants can read league rounds" on public.league_rounds
for select to authenticated using (
  public.is_admin() or public.is_league_participant(league_id)
);
