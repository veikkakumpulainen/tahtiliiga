-- Fires the notify-qualification-message Edge Function whenever a new
-- qualification-match chat message is inserted, mirroring
-- notify_group_message_webhook / notify_community_message_webhook (both use
-- the same pattern: read the shared secret and this function's own URL from
-- Supabase Vault by name, since those differ per project, and skip silently
-- if either hasn't been configured yet for this project).

create or replace function public.notify_qualification_message_webhook()
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
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'notify_qualification_message_url' limit 1;

  if shared_secret is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'qualification_messages', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists qualification_messages_notify_webhook on public.qualification_messages;
create trigger qualification_messages_notify_webhook
after insert on public.qualification_messages
for each row execute function public.notify_qualification_message_webhook();
