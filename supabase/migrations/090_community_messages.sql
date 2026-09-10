-- "Yhteisö" (community) broadcast feed: a league-wide announcement channel
-- where only admins can post, but every member of the league can read.
-- Mirrors the shape of group_messages (001_group_messages.sql) but scoped to
-- a whole league instead of one lohko, and insert is admin-only.

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_messages_league_created_idx
  on public.community_messages (league_id, created_at);

alter table public.community_messages enable row level security;

create policy "league members can read community messages"
  on public.community_messages for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.team_members tm
      join public.teams t on t.id = tm.team_id
      where t.league_id = community_messages.league_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

create policy "admins can send community messages"
  on public.community_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_admin());

create policy "admins can delete community messages"
  on public.community_messages for delete to authenticated
  using (public.is_admin());

alter publication supabase_realtime add table public.community_messages;

create or replace function public.get_community_messages(target_league_id uuid)
returns table (
  id uuid,
  message text,
  created_at timestamptz,
  user_id uuid,
  sender_first_name text,
  sender_last_name text
)
language sql
security definer
set search_path = public
as $$
  select
    cm.id,
    cm.message,
    cm.created_at,
    cm.user_id,
    p.first_name,
    p.last_name
  from public.community_messages cm
  join public.profiles p on p.id = cm.user_id
  where cm.league_id = target_league_id
    and (
      public.is_admin()
      or exists (
        select 1 from public.team_members tm
        join public.teams t on t.id = tm.team_id
        where t.league_id = target_league_id
          and tm.user_id = auth.uid()
          and tm.status = 'active'
      )
    )
  order by cm.created_at asc;
$$;

revoke all on function public.get_community_messages(uuid) from public;
grant execute on function public.get_community_messages(uuid) to authenticated;
