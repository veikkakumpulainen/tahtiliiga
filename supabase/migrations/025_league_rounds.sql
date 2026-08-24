alter table public.leagues
  add column if not exists end_date date;

alter table public.leagues
  drop constraint if exists leagues_end_date_after_start_date;

alter table public.leagues
  add constraint leagues_end_date_after_start_date
  check (end_date is null or end_date >= start_date);

create table if not exists public.league_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, name),
  check (end_date >= start_date)
);

create index if not exists league_rounds_league_idx on public.league_rounds(league_id, start_date);

create or replace function public.validate_league_round_dates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  league_start date;
  league_end date;
begin
  select start_date, end_date into league_start, league_end
  from public.leagues
  where id = new.league_id;

  if new.start_date < league_start or league_end is null or new.end_date > league_end then
    raise exception 'Round dates must be within the league date range';
  end if;
  return new;
end;
$$;

drop trigger if exists league_round_dates_within_league on public.league_rounds;
create trigger league_round_dates_within_league
before insert or update on public.league_rounds
for each row execute function public.validate_league_round_dates();

create or replace function public.prevent_league_dates_excluding_rounds()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.end_date is null or exists (
    select 1 from public.league_rounds
    where league_id = new.id
      and (start_date < new.start_date or end_date > new.end_date)
  ) then
    raise exception 'League dates must include all round dates';
  end if;
  return new;
end;
$$;

drop trigger if exists league_dates_include_rounds on public.leagues;
create trigger league_dates_include_rounds
before update of start_date, end_date on public.leagues
for each row execute function public.prevent_league_dates_excluding_rounds();

drop trigger if exists league_rounds_updated_at on public.league_rounds;
create trigger league_rounds_updated_at
before update on public.league_rounds
for each row execute function public.set_updated_at();

alter table public.league_rounds enable row level security;

drop policy if exists "participants can read league rounds" on public.league_rounds;
create policy "participants can read league rounds" on public.league_rounds
for select to authenticated using (
  public.is_admin() or exists (
    select 1
    from public.team_members membership
    join public.teams team on team.id = membership.team_id
    where membership.user_id = auth.uid()
      and team.league_id = league_rounds.league_id
  )
);

drop policy if exists "admins can manage league rounds" on public.league_rounds;
create policy "admins can manage league rounds" on public.league_rounds
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.league_rounds to authenticated;