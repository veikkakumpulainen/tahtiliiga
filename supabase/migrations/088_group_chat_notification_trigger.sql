-- Fires the notify-group-message Edge Function whenever a new lohko chat
-- message is inserted, so every other group member gets a push notification.
-- Bypasses the Dashboard's "Database Webhooks" feature (this project is
-- missing its internal supabase_functions bootstrap schema) and instead
-- calls pg_net directly. The shared secret is looked up from Supabase Vault
-- by name at trigger time, never stored in this file.

-- rls_auto_enable_trigger (see 0825_recreate_rls_auto_enable.sql) tries to
-- enable RLS on every new table, including pg_net's own internal tables it
-- doesn't own - disable it for the extension install, then restore it.
alter event trigger rls_auto_enable_trigger disable;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net;
  end if;
end $$;

alter event trigger rls_auto_enable_trigger enable;

create or replace function public.notify_group_message_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shared_secret text;
begin
  select decrypted_secret into shared_secret
  from vault.decrypted_secrets
  where name = 'function_internal_secret'
  limit 1;

  perform net.http_post(
    url := 'https://onmrikfysxqkzlnhlepv.supabase.co/functions/v1/notify-group-message',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'group_messages', 'record', to_jsonb(NEW)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists group_messages_notify_webhook on public.group_messages;
create trigger group_messages_notify_webhook
after insert on public.group_messages
for each row execute function public.notify_group_message_webhook();
