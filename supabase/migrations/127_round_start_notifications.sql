-- Push notification to every player of a league when one of its rounds
-- starts (a league_rounds row turns 'active', however that happens). Fires
-- the notify-round-started Edge Function the same way the chat triggers do
-- (see 109): URL and shared secret come from Vault by name, and a project
-- without them configured just skips the notification.

-- Players can turn round-start notifications off. Admin notifications are no
-- longer a separate setting: only "mute everything" stops them.
alter table public.notification_preferences add column if not exists round_starts boolean not null default true;
alter table public.notification_preferences drop column if exists admin_notifications;

create or replace function public.notify_round_started_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shared_secret text;
  function_url text;
begin
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select decrypted_secret into shared_secret from vault.decrypted_secrets where name = 'function_internal_secret' limit 1;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'notify_round_started_url' limit 1;

  if shared_secret is null or function_url is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
    body := jsonb_build_object('type', tg_op, 'table', 'league_rounds', 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists league_rounds_notify_started on public.league_rounds;
create trigger league_rounds_notify_started
after insert or update of status on public.league_rounds
for each row when (new.status = 'active')
execute function public.notify_round_started_webhook();
