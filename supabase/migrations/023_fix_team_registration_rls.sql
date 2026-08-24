-- A newly created team must be visible to its creator before team members exist.
grant usage on schema public to authenticated;
grant select, insert on public.teams to authenticated;

drop policy if exists "captains can create teams" on public.teams;
create policy "captains can create teams" on public.teams
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "admins can create teams" on public.teams;
create policy "admins can create teams" on public.teams
for insert to authenticated
with check (public.is_admin());

drop policy if exists "users can read visible teams" on public.teams;
create policy "users can read visible teams" on public.teams
for select to authenticated using (
  created_by = auth.uid()
  or captain_id = auth.uid()
  or public.is_team_member(id)
  or public.is_admin()
);