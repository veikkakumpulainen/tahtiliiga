create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at);

alter table public.group_messages enable row level security;

create policy "group members can read messages"
  on public.group_messages for select to authenticated
  using (
    exists (
      select 1 from public.group_teams gt
      join public.team_members tm on tm.team_id = gt.team_id
      where gt.group_id = group_messages.group_id
        and tm.user_id = auth.uid()
    )
    or public.is_admin()
  );

create policy "group members can send messages"
  on public.group_messages for insert to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.group_teams gt
      join public.team_members tm on tm.team_id = gt.team_id
      where gt.group_id = group_messages.group_id
        and tm.user_id = auth.uid()
    )
  );

create policy "admins can delete messages"
  on public.group_messages for delete to authenticated
  using (public.is_admin());

alter publication supabase_realtime add table public.group_messages;