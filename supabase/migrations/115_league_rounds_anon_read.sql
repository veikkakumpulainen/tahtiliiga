-- The round schedule (kierrosaikataulu) button on the public web index page
-- (index.web.tsx) is visible to visitors who have not logged in, so anon
-- also needs read access to league_rounds - matching the anon-read policy
-- already in place for the "leagues" table (067_public_tournament_viewing.sql).
grant select on public.league_rounds to anon;
create policy "anyone can read league rounds" on public.league_rounds
for select to anon using (true);
