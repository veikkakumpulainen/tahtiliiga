-- Private chats started by an admin from the chat tab's "Uusi keskustelu"
-- button: the admin picks one or more people, and everyone picked can read
-- and reply. The admin can add more people later (they also see the earlier
-- messages). Unlike the captains' direct conversations (130) these aren't
-- tied to a league and aren't wiped when a round starts. Starting one with a
-- single person reopens the existing one-to-one conversation, if any.

create table if not exists public.admin_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_conversation_members (
  conversation_id uuid not null references public.admin_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists admin_conversation_members_user_idx on public.admin_conversation_members (user_id);

create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.admin_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists admin_messages_conversation_idx on public.admin_messages (conversation_id, created_at);

create or replace function public.is_admin_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_conversation_members where conversation_id = target_conversation_id and user_id = auth.uid());
$$;

revoke all on function public.is_admin_conversation_member(uuid) from public, anon;
grant execute on function public.is_admin_conversation_member(uuid) to authenticated;

alter table public.admin_conversations enable row level security;
alter table public.admin_conversation_members enable row level security;
alter table public.admin_messages enable row level security;

-- Conversations and members are created and changed only through the RPCs below.
drop policy if exists "members can read admin conversations" on public.admin_conversations;
create policy "members can read admin conversations" on public.admin_conversations
for select to authenticated using (public.is_admin_conversation_member(id));

drop policy if exists "members can read admin conversation members" on public.admin_conversation_members;
create policy "members can read admin conversation members" on public.admin_conversation_members
for select to authenticated using (public.is_admin_conversation_member(conversation_id));

drop policy if exists "members can read admin messages" on public.admin_messages;
create policy "members can read admin messages" on public.admin_messages
for select to authenticated using (public.is_admin_conversation_member(conversation_id));

drop policy if exists "members can send admin messages" on public.admin_messages;
create policy "members can send admin messages" on public.admin_messages
for insert to authenticated with check (user_id = auth.uid() and public.is_admin_conversation_member(conversation_id));

drop policy if exists "users can delete own admin messages" on public.admin_messages;
create policy "users can delete own admin messages" on public.admin_messages
for delete to authenticated using (user_id = auth.uid());

grant select on public.admin_conversations, public.admin_conversation_members to authenticated;
grant select, insert, delete on public.admin_messages to authenticated;

-- People search for the admin's picker: by name, or by player code (#123).
create or replace function public.search_players_for_admin_chat(search_query text)
returns table (id uuid, first_name text, last_name text, player_code integer)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.player_code
  from public.profiles profile
  where public.is_admin()
    and profile.deleted_at is null
    and profile.id <> auth.uid()
    and (
      (char_length(btrim(search_query)) >= 2 and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%')
      or profile.player_code::text = ltrim(btrim(search_query), '#')
    )
  order by profile.first_name, profile.last_name
  limit 8;
$$;

revoke all on function public.search_players_for_admin_chat(text) from public, anon;
grant execute on function public.search_players_for_admin_chat(text) to authenticated;

create or replace function public.start_admin_conversation(member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  others uuid[];
  conversation_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can start these conversations'; end if;
  select coalesce(array_agg(distinct member_id), array[]::uuid[]) into others
  from unnest(member_ids) member_id
  where member_id <> auth.uid() and exists (select 1 from public.profiles where id = member_id and deleted_at is null);
  if cardinality(others) = 0 then raise exception 'Choose at least one person'; end if;

  if cardinality(others) = 1 then
    select conversation.id into conversation_id
    from public.admin_conversations conversation
    where (select array_agg(member.user_id order by member.user_id) from public.admin_conversation_members member where member.conversation_id = conversation.id)
      = (select array_agg(person order by person) from unnest(array[auth.uid(), others[1]]) person)
    order by conversation.created_at
    limit 1;
    if conversation_id is not null then return conversation_id; end if;
  end if;

  insert into public.admin_conversations (created_by) values (auth.uid()) returning id into conversation_id;
  insert into public.admin_conversation_members (conversation_id, user_id)
  select conversation_id, person from unnest(array_append(others, auth.uid())) person;
  return conversation_id;
end;
$$;

revoke all on function public.start_admin_conversation(uuid[]) from public, anon;
grant execute on function public.start_admin_conversation(uuid[]) to authenticated;

create or replace function public.add_admin_conversation_members(target_conversation_id uuid, member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() or not public.is_admin_conversation_member(target_conversation_id) then
    raise exception 'Only an admin in the conversation can add people';
  end if;
  insert into public.admin_conversation_members (conversation_id, user_id)
  select target_conversation_id, profile.id from public.profiles profile
  where profile.id = any(member_ids) and profile.deleted_at is null
  on conflict do nothing;
end;
$$;

revoke all on function public.add_admin_conversation_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_admin_conversation_members(uuid, uuid[]) to authenticated;

-- The chat list's rows: the caller's conversations with everyone else's names.
create or replace function public.get_my_admin_conversations()
returns table (id uuid, created_at timestamptz, other_names text, member_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select conversation.id, conversation.created_at,
    coalesce(string_agg(concat_ws(' ', profile.first_name, profile.last_name), ', ' order by profile.first_name, profile.last_name) filter (where member.user_id <> auth.uid()), ''),
    count(member.user_id)::integer
  from public.admin_conversations conversation
  join public.admin_conversation_members member on member.conversation_id = conversation.id
  join public.profiles profile on profile.id = member.user_id
  where public.is_admin_conversation_member(conversation.id)
  group by conversation.id, conversation.created_at;
$$;

revoke all on function public.get_my_admin_conversations() from public, anon;
grant execute on function public.get_my_admin_conversations() to authenticated;

create or replace function public.get_admin_conversation_members(target_conversation_id uuid)
returns table (user_id uuid, first_name text, last_name text, player_code integer, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.player_code, profile.role = 'admin'
  from public.admin_conversation_members member
  join public.profiles profile on profile.id = member.user_id
  where member.conversation_id = target_conversation_id
    and public.is_admin_conversation_member(target_conversation_id)
  order by profile.first_name, profile.last_name;
$$;

revoke all on function public.get_admin_conversation_members(uuid) from public, anon;
grant execute on function public.get_admin_conversation_members(uuid) to authenticated;

create or replace function public.get_admin_messages(target_conversation_id uuid)
returns table (id uuid, message text, created_at timestamptz, user_id uuid, sender_first_name text, sender_last_name text, sender_is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select message.id, message.message, message.created_at, message.user_id, profile.first_name, profile.last_name, profile.role = 'admin'
  from public.admin_messages message
  join public.profiles profile on profile.id = message.user_id
  where message.conversation_id = target_conversation_id
    and public.is_admin_conversation_member(target_conversation_id)
  order by message.created_at;
$$;

revoke all on function public.get_admin_messages(uuid) from public, anon;
grant execute on function public.get_admin_messages(uuid) to authenticated;

-- Unread dot / live refresh ping, as notify_direct_message() (130).
create or replace function public.notify_admin_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select member.user_id from public.admin_conversation_members member
    where member.conversation_id = new.conversation_id and member.user_id <> new.user_id
  loop
    perform realtime.send(
      jsonb_build_object('admin_chat_id', new.conversation_id, 'message_id', new.id),
      'unread_chat',
      'user-notify:' || recipient::text,
      true
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_admin_message_trigger on public.admin_messages;
create trigger notify_admin_message_trigger
after insert on public.admin_messages
for each row execute function public.notify_admin_message();

-- Delete ping, as 121_chat_message_delete_broadcast.sql.
create or replace function public.notify_admin_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  for target in
    select d.conversation_id, member.user_id as participant, jsonb_agg(distinct d.id) as message_ids
    from deleted_rows d
    join public.admin_conversation_members member on member.conversation_id = d.conversation_id
    group by d.conversation_id, member.user_id
  loop
    perform realtime.send(jsonb_build_object('admin_chat_id', target.conversation_id, 'message_ids', target.message_ids), 'chat_deleted', 'user-notify:' || target.participant::text, true);
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_admin_message_deleted_trigger on public.admin_messages;
create trigger notify_admin_message_deleted_trigger
after delete on public.admin_messages
referencing old table as deleted_rows
for each statement execute function public.notify_admin_message_deleted();

-- Push notifications, as notify_direct_message_webhook() (130). Needs the
-- Vault secret notify_admin_message_url pointing at the notify-admin-message
-- function.
create or replace function public.notify_admin_message_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shared_secret text;
  function_url text;
begin
  select decrypted_secret into shared_secret from vault.decrypted_secrets where name = 'function_internal_secret' limit 1;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'notify_admin_message_url' limit 1;

  if shared_secret is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'admin_messages', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists admin_messages_notify_webhook on public.admin_messages;
create trigger admin_messages_notify_webhook
after insert on public.admin_messages
for each row execute function public.notify_admin_message_webhook();

-- Per-thread muting; the notifications themselves fall under the
-- direct_messages setting ("Chat-viestit").
alter table public.muted_conversations drop constraint if exists muted_conversations_thread_type_check;
alter table public.muted_conversations add constraint muted_conversations_thread_type_check
  check (thread_type in ('group', 'qualification', 'community', 'direct', 'admin'));
