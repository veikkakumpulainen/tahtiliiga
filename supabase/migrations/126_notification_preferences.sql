-- Push notification settings. A user can mute everything, mute a whole kind
-- of notification, or mute a single chat thread from the chat list. The
-- notify-* edge functions drop muted recipients before sending. A missing
-- preferences row means everything is on.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_all boolean not null default false,
  group_messages boolean not null default true,
  qualification_messages boolean not null default true,
  community_messages boolean not null default true,
  admin_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "users manage their own notification preferences" on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- thread_id is the group, match or league id the thread's messages hang
-- off, matching the chat list's thread types.
create table if not exists public.muted_conversations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_type text not null check (thread_type in ('group', 'qualification', 'community')),
  thread_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_type, thread_id)
);

create index if not exists muted_conversations_thread_idx on public.muted_conversations (thread_type, thread_id);

alter table public.muted_conversations enable row level security;

create policy "users manage their own muted conversations" on public.muted_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.muted_conversations to authenticated;
