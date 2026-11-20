-- An admin in an admin conversation (132) can close it: the conversation and
-- its messages are deleted, so it disappears from every member's chat list.
-- Starting a conversation with the same person later begins a new, empty one.
--
-- The other members get a chat_deleted ping (as 121) carrying the closed
-- conversation's id, so an open app drops it from the list at once. The ping
-- is sent before the delete because the cascade removes the member rows.

create or replace function public.close_admin_conversation(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  if not public.is_admin() or not public.is_admin_conversation_member(target_conversation_id) then
    raise exception 'Only an admin in the conversation can close it';
  end if;

  for recipient in
    select member.user_id from public.admin_conversation_members member
    where member.conversation_id = target_conversation_id and member.user_id <> auth.uid()
  loop
    perform realtime.send(
      jsonb_build_object('admin_chat_id', target_conversation_id, 'admin_chat_closed', true, 'message_ids', '[]'::jsonb),
      'chat_deleted',
      'user-notify:' || recipient::text,
      true
    );
  end loop;

  delete from public.admin_conversations where id = target_conversation_id;
end;
$$;

revoke all on function public.close_admin_conversation(uuid) from public, anon;
grant execute on function public.close_admin_conversation(uuid) to authenticated;
