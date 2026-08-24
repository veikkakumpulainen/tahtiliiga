-- Restrict league-owned data to participants and admins after 009_fix_recursive_rls.sql.
drop policy if exists "users can read visible teams" on public.teams;
create policy "users can read visible teams" on public.teams
for select to authenticated using (public.is_team_member(id) or public.is_admin());

drop policy if exists "users can read groups" on public.groups;
create policy "users can read groups" on public.groups
for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.group_teams gt where gt.group_id = groups.id and public.is_team_member(gt.team_id)
  )
);

drop policy if exists "users can read group teams" on public.group_teams;
create policy "users can read group teams" on public.group_teams
for select to authenticated using (public.is_admin() or public.is_team_member(team_id));

drop policy if exists "users can read their payments" on public.payments;
create policy "users can read their payments" on public.payments
for select to authenticated using (public.is_admin() or user_id = auth.uid() or public.is_team_member(team_id));

-- Avoid exposing profile email addresses through a client-callable lookup.
drop function if exists public.find_profile_by_email(text);
create or replace function public.find_profile_by_email(search_email text)
returns table (id uuid, first_name text, last_name text)
language sql security definer set search_path = public
as $$
  select p.id, p.first_name, p.last_name
  from public.profiles p
  where auth.uid() is not null
    and lower(p.email) = lower(search_email)
  limit 1;
$$;
revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;