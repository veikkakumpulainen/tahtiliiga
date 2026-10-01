-- Deleting a chat message (120_delete_own_chat_messages.sql) only showed up
-- for other participants after they reopened the chat. Ping every participant
-- over the same private 'user-notify:<user_id>' channel used for new messages
-- (101_unread_chat_broadcast.sql), with a separate 'chat_deleted' event that
-- carries the deleted ids so an open chat can drop them in place (no refetch,
-- no scroll jump) and nothing gets flagged unread.
--
-- Statement-level triggers with a transition table: the round-start/
-- membership-change cleanups (112/113) bulk-delete whole threads, and this
-- way they cost one ping per participant per thread instead of one per row.
-- The sender is included too, so their other open devices update as well.

create or replace function public.notify_group_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  for target in
    select d.group_id, tm.user_id, jsonb_agg(distinct d.id) as message_ids
    from deleted_rows d
    join public.group_teams gt on gt.group_id = d.group_id
    join public.team_members tm on tm.team_id = gt.team_id
    group by d.group_id, tm.user_id
  loop
    perform realtime.send(jsonb_build_object('group_id', target.group_id, 'message_ids', target.message_ids), 'chat_deleted', 'user-notify:' || target.user_id::text, true);
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_group_message_deleted_trigger on public.group_messages;
create trigger notify_group_message_deleted_trigger
after delete on public.group_messages
referencing old table as deleted_rows
for each statement execute function public.notify_group_message_deleted();

create or replace function public.notify_qualification_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  for target in
    select d.match_id, tm.user_id, jsonb_agg(distinct d.id) as message_ids
    from deleted_rows d
    join public.matches m on m.id = d.match_id
    join public.team_members tm on tm.team_id in (m.home_team_id, m.away_team_id)
    group by d.match_id, tm.user_id
  loop
    perform realtime.send(jsonb_build_object('match_id', target.match_id, 'message_ids', target.message_ids), 'chat_deleted', 'user-notify:' || target.user_id::text, true);
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_qualification_message_deleted_trigger on public.qualification_messages;
create trigger notify_qualification_message_deleted_trigger
after delete on public.qualification_messages
referencing old table as deleted_rows
for each statement execute function public.notify_qualification_message_deleted();

create or replace function public.notify_community_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  for target in
    select d.league_id, tm.user_id, jsonb_agg(distinct d.id) as message_ids
    from deleted_rows d
    join public.teams t on t.league_id = d.league_id
    join public.team_members tm on tm.team_id = t.id and tm.status = 'active'
    group by d.league_id, tm.user_id
  loop
    perform realtime.send(jsonb_build_object('league_id', target.league_id, 'message_ids', target.message_ids), 'chat_deleted', 'user-notify:' || target.user_id::text, true);
  end loop;
  return null;
end;
$$;

drop trigger if exists notify_community_message_deleted_trigger on public.community_messages;
create trigger notify_community_message_deleted_trigger
after delete on public.community_messages
referencing old table as deleted_rows
for each statement execute function public.notify_community_message_deleted();
