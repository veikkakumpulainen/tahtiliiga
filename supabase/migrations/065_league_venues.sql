-- Admins pick the city a league plays in and the venues available there, so
-- players marking a match's location choose from a known list instead of
-- typing a free-text place name every time.

alter table public.leagues
  add column if not exists city text;

create table if not exists public.league_venues (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (league_id, name)
);

create index if not exists league_venues_league_idx on public.league_venues (league_id);

alter table public.league_venues enable row level security;

drop policy if exists "authenticated users can read league venues" on public.league_venues;
create policy "authenticated users can read league venues" on public.league_venues
for select to authenticated using (true);

drop policy if exists "admins can manage league venues" on public.league_venues;
create policy "admins can manage league venues" on public.league_venues
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.league_venues to authenticated;
