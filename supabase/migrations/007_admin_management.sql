alter table public.groups add column if not exists status text not null default 'draft' check (status in ('draft', 'published'));
alter table public.groups add column if not exists published_at timestamptz;

create policy "admins can manage profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can manage team members" on public.team_members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can manage payments" on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can update matches" on public.matches for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins can delete matches" on public.matches for delete to authenticated using (public.is_admin());
create policy "admins can delete teams" on public.teams for delete to authenticated using (public.is_admin());

grant delete on public.teams, public.team_members, public.payments, public.matches to authenticated;