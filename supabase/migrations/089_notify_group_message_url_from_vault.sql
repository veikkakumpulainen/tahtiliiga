-- 088 hardcoded the notify-group-message function URL, which is different
-- per Supabase project (production vs tahtiliiga-dev) - the same migration
-- file is applied to both, so a literal URL only ever works for one of them.
-- Store it in Vault by name instead, alongside the shared secret, and fail
-- open (skip the notification instead of erroring the chat insert) if
-- either value hasn't been configured yet for this project.
create or replace function public.notify_group_message_webhook()
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
  where name = 'notify_group_message_url'
  limit 1;

  if shared_secret is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'group_messages', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;
