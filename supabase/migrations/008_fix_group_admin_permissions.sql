alter table public.groups add column if not exists status text not null default 'draft' check (status in ('draft', 'published'));
alter table public.groups add column if not exists published_at timestamptz;

grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_teams to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'groups' and policyname = 'admins can manage groups') then
    create policy "admins can manage groups" on public.groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'group_teams' and policyname = 'admins can manage group teams') then
    create policy "admins can manage group teams" on public.group_teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;