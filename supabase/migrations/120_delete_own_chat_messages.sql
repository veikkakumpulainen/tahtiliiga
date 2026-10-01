-- Senders can delete their own chat messages (admins already could delete
-- group/community messages).

drop policy if exists "users can delete own group messages" on public.group_messages;
create policy "users can delete own group messages" on public.group_messages
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "users can delete own qualification messages" on public.qualification_messages;
create policy "users can delete own qualification messages" on public.qualification_messages
for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users can delete own community messages" on public.community_messages;
create policy "users can delete own community messages" on public.community_messages
for delete to authenticated using (user_id = auth.uid());

grant delete on public.group_messages, public.qualification_messages, public.community_messages to authenticated;
