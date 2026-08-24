-- Allow signed-in players to register their own team and admins to create teams.
grant usage on schema public to authenticated;
grant insert on public.teams to authenticated;

drop policy if exists "captains can create teams" on public.teams;
create policy "captains can create teams" on public.teams
for insert to authenticated
with check (
  created_by = auth.uid()
  and captain_id = auth.uid()
);

drop policy if exists "admins can create teams" on public.teams;
create policy "admins can create teams" on public.teams
for insert to authenticated
with check (public.is_admin());