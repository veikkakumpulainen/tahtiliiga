-- Mirrors notify_group_message()/notify_community_message() from
-- 101_unread_chat_broadcast.sql for the new qualification-match chat, so its
-- unread dot and live-refresh-while-open behave the same way as lohko and
-- tiedotteet chat.

create or replace function public.notify_qualification_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  match_home_team_id uuid;
  match_away_team_id uuid;
begin
  select home_team_id, away_team_id into match_home_team_id, match_away_team_id
  from public.matches where id = new.match_id;

  for recipient in
    select distinct tm.user_id
    from public.team_members tm
    where tm.team_id in (match_home_team_id, match_away_team_id)
      and tm.user_id <> new.user_id
  loop
    perform realtime.send(
      jsonb_build_object('match_id', new.match_id, 'message_id', new.id),
      'unread_chat',
      'user-notify:' || recipient::text,
      true
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_qualification_message_trigger on public.qualification_messages;
create trigger notify_qualification_message_trigger
after insert on public.qualification_messages
for each row execute function public.notify_qualification_message();
