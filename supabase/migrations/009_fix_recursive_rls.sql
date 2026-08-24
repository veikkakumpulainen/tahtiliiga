create or replace function public.is_team_member(target_team_id uuid)
returns boolean language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_team_member(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;

drop policy if exists "users can read team members" on public.team_members;
create policy "users can read team members" on public.team_members
for select to authenticated using (
  user_id = auth.uid() or public.is_team_member(team_id) or public.is_admin()
);

drop policy if exists "group members can read messages" on public.group_messages;
create policy "group members can read messages" on public.group_messages
for select to authenticated using (
  exists (
    select 1 from public.group_teams gt
    where gt.group_id = group_messages.group_id
      and public.is_team_member(gt.team_id)
  )
  or public.is_admin()
);

drop policy if exists "group members can send messages" on public.group_messages;
create policy "group members can send messages" on public.group_messages
for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.group_teams gt
    where gt.group_id = group_messages.group_id
      and public.is_team_member(gt.team_id)
  )
);

drop policy if exists "group members can read matches" on public.matches;
create policy "group members can read matches" on public.matches
for select to authenticated using (
  public.is_team_member(home_team_id)
  or public.is_team_member(away_team_id)
  or public.is_admin()
);

drop policy if exists "own team members can update matches" on public.matches;
create policy "own team members can update matches" on public.matches
for update to authenticated using (
  public.is_team_member(home_team_id) or public.is_team_member(away_team_id)
) with check (
  public.is_team_member(home_team_id) or public.is_team_member(away_team_id)
);