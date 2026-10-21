-- Padel halls as an app-wide list per city, with a link to each hall's
-- booking system. Admins maintain the list (Ylläpito -> Padelhallit) and pick
-- which halls belong to a league; a new league starts with every hall in its
-- city. The match editor lists the league's halls both as venue options and
-- behind "Katso vapaat vuorot", which opens a hall's booking page.
--
-- Replaces the per-league free-text league_venues (065), whose names are
-- carried over below as halls without a booking link. matches.venue stays a
-- plain hall name.

create table if not exists public.padel_halls (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  booking_url text check (booking_url is null or booking_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  unique (city_id, name)
);

create index if not exists padel_halls_city_idx on public.padel_halls (city_id);

alter table public.padel_halls enable row level security;

drop policy if exists "anyone can read padel halls" on public.padel_halls;
create policy "anyone can read padel halls" on public.padel_halls
for select to anon, authenticated using (true);

drop policy if exists "admins can manage padel halls" on public.padel_halls;
create policy "admins can manage padel halls" on public.padel_halls
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.padel_halls to anon, authenticated;
grant insert, update, delete on public.padel_halls to authenticated;

create table if not exists public.league_halls (
  league_id uuid not null references public.leagues(id) on delete cascade,
  hall_id uuid not null references public.padel_halls(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, hall_id)
);

create index if not exists league_halls_hall_idx on public.league_halls (hall_id);

alter table public.league_halls enable row level security;

drop policy if exists "authenticated users can read league halls" on public.league_halls;
create policy "authenticated users can read league halls" on public.league_halls
for select to authenticated using (true);

drop policy if exists "admins can manage league halls" on public.league_halls;
create policy "admins can manage league halls" on public.league_halls
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, delete on public.league_halls to authenticated;

-- Existing venues become halls in their league's city.
insert into public.padel_halls (city_id, name)
select distinct league.city_id, btrim(venue.name)
from public.league_venues venue
join public.leagues league on league.id = venue.league_id
on conflict (city_id, name) do nothing;

insert into public.league_halls (league_id, hall_id)
select venue.league_id, hall.id
from public.league_venues venue
join public.leagues league on league.id = venue.league_id
join public.padel_halls hall on hall.city_id = league.city_id and hall.name = btrim(venue.name)
on conflict do nothing;

comment on table public.league_venues is 'Deprecated: use league_halls / padel_halls.';
