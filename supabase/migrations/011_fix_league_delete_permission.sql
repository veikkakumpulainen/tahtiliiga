grant delete on public.leagues to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leagues'
      and policyname = 'admins can manage leagues'
  ) then
    create policy "admins can manage leagues"
      on public.leagues for all to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;