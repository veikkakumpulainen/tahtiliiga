-- The round schedule (kierrosaikataulu) is now shown from a calendar button
-- in the shared top bar on every screen, not just to league participants -
-- open up read access to any authenticated user, matching the "leagues"
-- table's own read policy (using (true)), instead of gating it to admins
-- and users with a team in that specific league.
drop policy if exists "participants can read league rounds" on public.league_rounds;
create policy "authenticated users can read league rounds" on public.league_rounds
for select to authenticated using (true);
