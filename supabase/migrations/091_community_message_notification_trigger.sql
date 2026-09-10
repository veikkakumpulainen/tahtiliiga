-- Fires the notify-community-message Edge Function whenever a new "yhteisö"
-- announcement is inserted, so every league member gets a push notification.
-- Mirrors notify_group_message_webhook (089_notify_group_message_url_from_vault.sql)
-- but targets community_messages and a separate function URL, since the
-- community feed is league-wide rather than per-lohko. The function URL and
-- shared secret are looked up from Supabase Vault by name at trigger time
-- (different per project), and the insert is never blocked if either hasn't
-- been configured yet.

create or replace function public.notify_community_message_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shared_secret text;
  function_url text;
begin
  select decrypted_secret into shared_secret
  from vault.decrypted_secrets
  where name = 'function_internal_secret'
  limit 1;

  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'notify_community_message_url'
  limit 1;

  if shared_secret is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'community_messages', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists community_messages_notify_webhook on public.community_messages;
create trigger community_messages_notify_webhook
after insert on public.community_messages
for each row execute function public.notify_community_message_webhook();
