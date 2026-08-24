-- SQL Editor-created tables need explicit API grants in some Supabase projects.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.teams to authenticated;
grant select, insert on public.team_members to authenticated;
grant select on public.leagues, public.groups, public.group_teams, public.payments, public.matches, public.group_messages to authenticated;
grant insert on public.leagues, public.matches, public.group_messages to authenticated;
grant update on public.leagues, public.matches, public.group_messages to authenticated;
grant delete on public.group_messages to authenticated;
grant execute on function public.is_admin() to authenticated;