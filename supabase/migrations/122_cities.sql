-- Multi-city support: every league (season) belongs to a city and every
-- player picks the city whose league they follow. The app only shows the
-- player's own city; data under a league (teams, groups, matches, chats,
-- standings) is already scoped by league_id and needs no changes.
--
-- A player can't change city while they're on a team in an unfinished
-- league, and joining a team moves them to that league's city, so a
-- player's own league is always in the city they're viewing.

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

alter table public.cities enable row level security;

drop policy if exists "anyone can read cities" on public.cities;
create policy "anyone can read cities" on public.cities
for select to anon, authenticated using (true);

drop policy if exists "admins can manage cities" on public.cities;
create policy "admins can manage cities" on public.cities
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.cities to anon, authenticated;
grant insert, update, delete on public.cities to authenticated;

-- Existing data: the league so far has run in Jyväskylä only.
insert into public.cities (name) values ('Jyväskylä') on conflict (name) do nothing;

alter table public.leagues
  add column if not exists city_id uuid references public.cities(id);

update public.leagues
set city_id = (select id from public.cities where name = 'Jyväskylä')
where city_id is null;

alter table public.leagues alter column city_id set not null;

create index if not exists leagues_city_idx on public.leagues (city_id);

-- leagues.city (free text, 065_league_venues.sql) is superseded by city_id.
-- Kept for now so an older admin client selecting it doesn't break.
comment on column public.leagues.city is 'Deprecated: use city_id.';

-- Nullable so a sign-up from an older app version (no city in metadata)
-- still works; the app falls back to the first city and asks in the profile.
alter table public.profiles
  add column if not exists city_id uuid references public.cities(id) on delete set null;

update public.profiles
set city_id = (select id from public.cities where name = 'Jyväskylä')
where city_id is null;

create index if not exists profiles_city_idx on public.profiles (city_id);

-- Sign-up passes the chosen city as city_id in the user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, email, phone, gender, skill_level, role,
    marketing_accepted, terms_accepted_at, privacy_accepted_at, city_id
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Pelaaja'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Uusi'),
    lower(new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'skill_level', ''),
    'user',
    coalesce((new.raw_user_meta_data ->> 'marketing_accepted')::boolean, false),
    NOW(),
    NOW(),
    (select city.id from public.cities city where city.id::text = new.raw_user_meta_data ->> 'city_id')
  )
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    gender = excluded.gender,
    skill_level = excluded.skill_level,
    marketing_accepted = coalesce((new.raw_user_meta_data ->> 'marketing_accepted')::boolean, false),
    terms_accepted_at = CASE WHEN profiles.terms_accepted_at IS NULL THEN NOW() ELSE profiles.terms_accepted_at END,
    privacy_accepted_at = CASE WHEN profiles.privacy_accepted_at IS NULL THEN NOW() ELSE profiles.privacy_accepted_at END,
    city_id = coalesce(excluded.city_id, profiles.city_id);
  return new;
end;
$$;

-- True when the player is on a team (active or invited) in an unfinished
-- league outside target_city_id.
create or replace function public.in_unfinished_league_outside_city(target_user_id uuid, target_city_id uuid, ignored_member_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members membership
    join public.teams team on team.id = membership.team_id
    join public.leagues league on league.id = team.league_id
    where membership.user_id = target_user_id
      and membership.id is distinct from ignored_member_id
      and league.status <> 'finished'
      and league.city_id is distinct from target_city_id
  );
$$;

revoke all on function public.in_unfinished_league_outside_city(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.prevent_city_change_during_league()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.city_id is distinct from old.city_id
    and not public.is_admin()
    and public.in_unfinished_league_outside_city(new.id, new.city_id) then
    raise exception 'City cannot be changed while registered in an unfinished league';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_city_locked_during_league on public.profiles;
create trigger profile_city_locked_during_league
before update of city_id on public.profiles
for each row execute function public.prevent_city_change_during_league();

-- Joining a team moves the player to that league's city. Being in two
-- cities' unfinished leagues at once is not supported.
create or replace function public.sync_player_city_on_team_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_city_id uuid;
begin
  select league.city_id into target_city_id
  from public.teams team
  join public.leagues league on league.id = team.league_id
  where team.id = new.team_id;

  if target_city_id is null then
    return new;
  end if;

  if public.in_unfinished_league_outside_city(new.user_id, target_city_id, new.id) then
    raise exception 'Player is already registered in an unfinished league in another city';
  end if;

  update public.profiles
  set city_id = target_city_id
  where id = new.user_id
    and city_id is distinct from target_city_id;
  return new;
end;
$$;

drop trigger if exists team_member_sync_city on public.team_members;
create trigger team_member_sync_city
after insert or update of team_id, user_id on public.team_members
for each row execute function public.sync_player_city_on_team_join();

-- If an admin moves an unfinished league to another city, its players move with it.
create or replace function public.sync_member_cities_on_league_city_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles profile
  set city_id = new.city_id
  where profile.id in (
    select membership.user_id
    from public.team_members membership
    join public.teams team on team.id = membership.team_id
    where team.league_id = new.id
  )
    and profile.city_id is distinct from new.city_id;
  return new;
end;
$$;

drop trigger if exists league_city_sync_members on public.leagues;
create trigger league_city_sync_members
after update of city_id on public.leagues
for each row
when (old.city_id is distinct from new.city_id and new.status <> 'finished')
execute function public.sync_member_cities_on_league_city_change();

revoke execute on function public.prevent_city_change_during_league() from anon, authenticated;
revoke execute on function public.sync_player_city_on_team_join() from anon, authenticated;
revoke execute on function public.sync_member_cities_on_league_city_change() from anon, authenticated;
