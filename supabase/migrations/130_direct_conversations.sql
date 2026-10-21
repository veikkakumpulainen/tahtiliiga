-- Private chats started from the chat tab's "Uusi keskustelu" button: a
-- captain picks another captain in their lohko. A conversation belongs to a
-- pair of teams (one per pair per lohko, team_a_id < team_b_id), so picking
-- the same captain again opens the existing one. At first only the two
-- captains (teams.captain_id) are in it; include_teams opens it to every
-- active member of both teams and can't be turned back off. Like the lohko
-- chat, every conversation in a league is wiped when a new round starts.

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  team_a_id uuid not null references public.teams(id) on delete cascade,
  team_b_id uuid not null references public.teams(id) on delete cascade,
  include_teams boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (team_a_id < team_b_id),
  unique (group_id, team_a_id, team_b_id)
);

create index if not exists direct_conversations_league_idx on public.direct_conversations (league_id);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_conversation_idx on public.direct_messages (conversation_id, created_at);

-- Everyone currently in a conversation. Not callable by clients; the
-- triggers below and the notify-direct-message function use it.
create or replace function public.direct_conversation_participants(target_conversation_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select team.captain_id
  from public.direct_conversations conversation
  join public.teams team on team.id in (conversation.team_a_id, conversation.team_b_id)
  where conversation.id = target_conversation_id
  union
  select membership.user_id
  from public.direct_conversations conversation
  join public.team_members membership on membership.team_id in (conversation.team_a_id, conversation.team_b_id) and membership.status = 'active'
  where conversation.id = target_conversation_id and conversation.include_teams;
$$;

revoke all on function public.direct_conversation_participants(uuid) from public, anon, authenticated;
grant execute on function public.direct_conversation_participants(uuid) to service_role;

create or replace function public.is_direct_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() in (select public.direct_conversation_participants(target_conversation_id));
$$;

revoke all on function public.is_direct_participant(uuid) from public, anon;
grant execute on function public.is_direct_participant(uuid) to authenticated;

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

-- Conversations are created and changed only through the RPCs below.
drop policy if exists "participants can read direct conversations" on public.direct_conversations;
create policy "participants can read direct conversations" on public.direct_conversations
for select to authenticated using (public.is_direct_participant(id));

drop policy if exists "participants can read direct messages" on public.direct_messages;
create policy "participants can read direct messages" on public.direct_messages
for select to authenticated using (public.is_direct_participant(conversation_id));

drop policy if exists "participants can send direct messages" on public.direct_messages;
create policy "participants can send direct messages" on public.direct_messages
for insert to authenticated with check (user_id = auth.uid() and public.is_direct_participant(conversation_id));

drop policy if exists "users can delete own direct messages" on public.direct_messages;
create policy "users can delete own direct messages" on public.direct_messages
for delete to authenticated using (user_id = auth.uid());

grant select on public.direct_conversations to authenticated;
grant select, insert, delete on public.direct_messages to authenticated;

-- Opens (or returns the existing) conversation between the caller's team and
-- another team in the same lohko. Only the caller's team captain may start
-- one, and only while the lohko chat itself is open (league running, no
-- qualification round active).
create or replace function public.start_direct_conversation(own_team_id uuid, other_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  shared_group_id uuid;
  target_league_id uuid;
  conversation_id uuid;
begin
  if own_team_id = other_team_id then raise exception 'Choose another team'; end if;
  if not exists (select 1 from public.teams where id = own_team_id and captain_id = auth.uid()) then
    raise exception 'Only the team captain can start a conversation';
  end if;

  select own_group.group_id, league_group.league_id into shared_group_id, target_league_id
  from public.group_teams own_group
  join public.group_teams other_group on other_group.group_id = own_group.group_id and other_group.team_id = other_team_id
  join public.groups league_group on league_group.id = own_group.group_id
  join public.leagues league on league.id = league_group.league_id and league.status = 'ongoing'
  where own_group.team_id = own_team_id;

  if shared_group_id is null then raise exception 'The teams are not in the same group'; end if;
  if exists (select 1 from public.league_rounds where league_id = target_league_id and round_type = 'qualification' and status = 'active') then
    raise exception 'Conversations are closed during a qualification round';
  end if;

  insert into public.direct_conversations (league_id, group_id, team_a_id, team_b_id, created_by)
  values (target_league_id, shared_group_id, least(own_team_id, other_team_id), greatest(own_team_id, other_team_id), auth.uid())
  on conflict (group_id, team_a_id, team_b_id) do nothing
  returning id into conversation_id;

  if conversation_id is null then
    select id into conversation_id from public.direct_conversations
    where group_id = shared_group_id and team_a_id = least(own_team_id, other_team_id) and team_b_id = greatest(own_team_id, other_team_id);
  end if;
  return conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid, uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid, uuid) to authenticated;

create or replace function public.include_teams_in_direct_conversation(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_direct_participant(target_conversation_id) then
    raise exception 'Not a participant';
  end if;
  update public.direct_conversations set include_teams = true where id = target_conversation_id;
end;
$$;

revoke all on function public.include_teams_in_direct_conversation(uuid) from public, anon;
grant execute on function public.include_teams_in_direct_conversation(uuid) to authenticated;

-- The chat list's rows: the caller's conversations with the other team's
-- name and captain. own_team_id is the caller's side of the pair.
create or replace function public.get_my_direct_conversations()
returns table (
  id uuid,
  league_id uuid,
  league_name text,
  group_name text,
  category text,
  include_teams boolean,
  own_team_id uuid,
  other_team_id uuid,
  other_team_name text,
  other_captain_first_name text,
  other_captain_last_name text
)
language sql
security definer
set search_path = public
as $$
  select
    conversation.id, conversation.league_id, league.name, league_group.name, league_group.category, conversation.include_teams,
    own_team.id, other_team.id, other_team.name, captain.first_name, captain.last_name
  from public.direct_conversations conversation
  join public.leagues league on league.id = conversation.league_id
  join public.groups league_group on league_group.id = conversation.group_id
  join public.teams team_a on team_a.id = conversation.team_a_id
  join public.teams team_b on team_b.id = conversation.team_b_id
  cross join lateral (
    select case when team_a.captain_id = auth.uid() or public.is_team_member(team_a.id) then team_a.id else team_b.id end as id
  ) own_side
  join public.teams own_team on own_team.id = own_side.id
  join public.teams other_team on other_team.id = case when own_side.id = team_a.id then team_b.id else team_a.id end
  join public.profiles captain on captain.id = other_team.captain_id
  where public.is_direct_participant(conversation.id);
$$;

revoke all on function public.get_my_direct_conversations() from public, anon;
grant execute on function public.get_my_direct_conversations() to authenticated;

create or replace function public.get_direct_messages(target_conversation_id uuid)
returns table (
  id uuid,
  message text,
  created_at timestamptz,
  user_id uuid,
  sender_first_name text,
  sender_last_name text,
  team_name text
)
language sql
security definer
set search_path = public
as $$
  select dm.id, dm.message, dm.created_at, dm.user_id, p.first_name, p.last_name, t.name
  from public.direct_messages dm
  join public.direct_conversations c on c.id = dm.conversation_id
  join public.profiles p on p.id = dm.user_id
  left join lateral (
    select team.name from public.teams team
    where team.id in (c.team_a_id, c.team_b_id)
      and (team.captain_id = dm.user_id or exists (select 1 from public.team_members tm where tm.team_id = team.id and tm.user_id = dm.user_id))
    limit 1
  ) t on true
  where dm.conversation_id = target_conversation_id
    and public.is_direct_participant(target_conversation_id)
  order by dm.created_at;
$$;

revoke all on function public.get_direct_messages(uuid) from public, anon;
grant execute on function public.get_direct_messages(uuid) to authenticated;

-- Unread dot / live refresh ping, as notify_qualification_message() (110).
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select participant from public.direct_conversation_participants(new.conversation_id) participant
    where participant <> new.user_id
  loop
    perform realtime.send(
      jsonb_build_object('direct_id', new.conversation_id, 'message_id', new.id),
      'unread_chat',
      'user-notify:' || recipient::text,
      true
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_direct_message_trigger on public.direct_messages;
create trigger notify_direct_message_trigger
after insert on public.direct_messages
for each row execute function public.notify_direct_message();

-- Delete ping, as 121_chat_message_delete_broadcast.sql. When the whole
-- conversation is being deleted (round start) its row is already gone, so
-- nobody is pinged; the chat list drops it on its next reload.
create or replace function public.notify_direct_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  for target in
    select d.conversation_id, participant, jsonb_agg(distinct d.id) as message_ids
    from deleted_rows d
    cross join lateral public.direct_conversation_participants(d.conversation_id) participant
    group by d.conversation_id, participant
  loop
    perform realtime.send(jsonb_build_object('direct_id', target.conversation_id, 'message_ids', target.message_ids), 'chat_deleted', 'user-notify:' || target.participant::text, true);
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_direct_message_deleted_trigger on public.direct_messages;
create trigger notify_direct_message_deleted_trigger
after delete on public.direct_messages
referencing old table as deleted_rows
for each statement execute function public.notify_direct_message_deleted();

-- Push notifications, as notify_qualification_message_webhook() (109).
create or replace function public.notify_direct_message_webhook()
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
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'notify_direct_message_url' limit 1;

  if shared_secret is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'direct_messages', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists direct_messages_notify_webhook on public.direct_messages;
create trigger direct_messages_notify_webhook
after insert on public.direct_messages
for each row execute function public.notify_direct_message_webhook();

-- A round becoming active (start_regular_round / start_qualification_round)
-- clears the league's conversations, like the lohko chat (113).
create or replace function public.clear_direct_conversations_on_round_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.direct_conversations where league_id = new.league_id;
  return new;
end;
$$;

revoke all on function public.clear_direct_conversations_on_round_start() from public, anon, authenticated;

drop trigger if exists clear_direct_conversations_on_round_start on public.league_rounds;
create trigger clear_direct_conversations_on_round_start
after update of status on public.league_rounds
for each row when (new.status = 'active' and old.status is distinct from 'active')
execute function public.clear_direct_conversations_on_round_start();

-- Notification settings: its own category (shown together with the lohko
-- and karsinta chats as "Chat-viestit") and per-thread muting.
alter table public.notification_preferences add column if not exists direct_messages boolean not null default true;

alter table public.muted_conversations drop constraint if exists muted_conversations_thread_type_check;
alter table public.muted_conversations add constraint muted_conversations_thread_type_check
  check (thread_type in ('group', 'qualification', 'community', 'direct'));
