-- The notify_group_message_webhook() function exists (redefined in
-- 089_notify_group_message_url_from_vault.sql), but the trigger that's
-- supposed to call it on every group_messages insert (created in
-- 088_group_chat_notification_trigger.sql) is missing from this project's
-- database - group chat messages were saving fine but never reaching the
-- notify-group-message Edge Function, so no push notification ever went
-- out. Recreate the trigger; it's idempotent (drop-if-exists first).

drop trigger if exists group_messages_notify_webhook on public.group_messages;
create trigger group_messages_notify_webhook
after insert on public.group_messages
for each row execute function public.notify_group_message_webhook();
