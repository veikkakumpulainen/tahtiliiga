-- The unread-chat badge (useUnreadChat.ts) subscribed to postgres_changes on
-- group_messages/community_messages, but those tables' SELECT RLS policies
-- grant access only through the security-definer helper is_team_member()
-- (needed elsewhere to avoid RLS recursion on team_members). Supabase
-- Realtime's own authorization check for postgres_changes does not reliably
-- evaluate that helper, so the client never received INSERT events unless it
-- was itself the sender - matching the reported bug (own outgoing messages
-- don't need this check at all, since e.g. payments realtime worked for a
-- user's own row via a plain "user_id = auth.uid()" clause with no helper
-- function involved).
--
-- Fix: broadcast a lightweight "new message" ping to each recipient's own
-- private channel ('user-notify:<user_id>') from a security-definer trigger,
-- which can freely read team_members/group_teams. The client only ever
-- subscribes to its own topic, so the Realtime Authorization check on
-- realtime.messages is a trivial "is this topic mine" - no helper functions,
-- no join, nothing for Realtime's authorization path to trip over.

create or replace function public.notify_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select distinct tm.user_id
    from public.group_teams gt
    join public.team_members tm on tm.team_id = gt.team_id
    where gt.group_id = new.group_id
      and tm.user_id <> new.user_id
  loop
    perform realtime.send(
      jsonb_build_object('group_id', new.group_id, 'message_id', new.id),
      'unread_chat',
      'user-notify:' || recipient::text,
      true
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_group_message_trigger on public.group_messages;
create trigger notify_group_message_trigger
after insert on public.group_messages
for each row execute function public.notify_group_message();

create or replace function public.notify_community_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select distinct tm.user_id
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where t.league_id = new.league_id
      and tm.status = 'active'
      and tm.user_id <> new.user_id
  loop
    perform realtime.send(
      jsonb_build_object('league_id', new.league_id, 'message_id', new.id),
      'unread_chat',
      'user-notify:' || recipient::text,
      true
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_community_message_trigger on public.community_messages;
create trigger notify_community_message_trigger
after insert on public.community_messages
for each row execute function public.notify_community_message();

drop policy if exists "users can listen to their own notify channel" on realtime.messages;
create policy "users can listen to their own notify channel"
on realtime.messages
for select
to authenticated
using (realtime.topic() = 'user-notify:' || auth.uid()::text);
