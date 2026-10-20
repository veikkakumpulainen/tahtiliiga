-- Reminds captains when a regular round has run for 7 days and their team
-- still has matches without an agreed time (matches.scheduled_at is null).
-- pg_cron runs send_round_reminders() hourly; it fires the
-- notify-round-reminder Edge Function once per round, the same way the chat
-- triggers do (see 109): URL and shared secret come from Vault by name, and
-- a project without them configured just skips the reminder.

-- When the round actually started (status turned 'active'), and whether its
-- reminder has gone out. Rounds started before this have no started_at and
-- count from their start_date.
alter table public.league_rounds add column if not exists started_at timestamptz;
alter table public.league_rounds add column if not exists reminder_sent_at timestamptz;

create or replace function public.set_league_round_started_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    new.started_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists league_rounds_set_started_at on public.league_rounds;
create trigger league_rounds_set_started_at
before insert or update of status on public.league_rounds
for each row execute function public.set_league_round_started_at();

-- Players can turn these reminders off in settings.
alter table public.notification_preferences add column if not exists match_reminders boolean not null default true;

create or replace function public.send_round_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shared_secret text;
  function_url text;
  due_round record;
begin
  select decrypted_secret into shared_secret from vault.decrypted_secrets where name = 'function_internal_secret' limit 1;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'notify_round_reminder_url' limit 1;

  if shared_secret is null or function_url is null then
    return;
  end if;

  for due_round in
    update public.league_rounds
    set reminder_sent_at = now()
    where status = 'active'
      and round_type = 'regular'
      and reminder_sent_at is null
      and coalesce(started_at, start_date::timestamptz) <= now() - interval '7 days'
      and end_date >= current_date
    returning id, name, league_id
  loop
    perform net.http_post(
      url := function_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', shared_secret),
      body := jsonb_build_object('table', 'league_rounds', 'record', jsonb_build_object('id', due_round.id, 'name', due_round.name, 'league_id', due_round.league_id)),
      timeout_milliseconds := 5000
    );
  end loop;
end;
$$;

revoke all on function public.send_round_reminders() from public;

-- rls_auto_enable_trigger would try to enable RLS on pg_cron's own tables
-- (see 088 for the same workaround with pg_net).
alter event trigger rls_auto_enable_trigger disable;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
end $$;

alter event trigger rls_auto_enable_trigger enable;

select cron.schedule('send-round-reminders', '0 * * * *', 'select public.send_round_reminders()');
