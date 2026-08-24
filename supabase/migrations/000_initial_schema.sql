create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  email text not null,
  phone text,
  gender text check (gender is null or gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  skill_level text check (skill_level is null or skill_level in ('A', 'B', 'C', 'D')),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  start_date date not null,
  registration_deadline date,
  status text not null default 'registration_open' check (status in ('registration_open', 'registration_closed', 'ongoing', 'finished')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_deadline is null or registration_deadline <= start_date)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  skill_level text not null check (skill_level in ('A', 'B', 'C', 'D')),
  skill_description text,
  captain_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, name)
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_captain boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (league_id, name)
);

create table if not exists public.group_teams (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  unique (group_id, team_id),
  unique (team_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_method text check (payment_method is null or payment_method in ('team', 'split')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (team_id, user_id)
);

create index if not exists teams_league_idx on public.teams (league_id);
create index if not exists team_members_user_idx on public.team_members (user_id);
create index if not exists groups_league_idx on public.groups (league_id);
create index if not exists group_teams_team_idx on public.group_teams (team_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists leagues_updated_at on public.leagues;
create trigger leagues_updated_at before update on public.leagues for each row execute function public.set_updated_at();
drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email, phone, gender, skill_level)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Pelaaja'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Uusi'),
    lower(new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'skill_level', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.groups enable row level security;
alter table public.group_teams enable row level security;
alter table public.payments enable row level security;

create policy "users can read their profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "users can update their profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and (role = 'user' or public.is_admin()));

create policy "authenticated users can read leagues" on public.leagues for select to authenticated using (true);
create policy "admins can manage leagues" on public.leagues for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users can read visible teams" on public.teams for select to authenticated using (true);
create policy "captains can create teams" on public.teams for insert to authenticated with check (created_by = auth.uid() and captain_id = auth.uid());
create policy "captains and admins can update teams" on public.teams for update to authenticated using (created_by = auth.uid() or captain_id = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or captain_id = auth.uid() or public.is_admin());

create policy "users can read team members" on public.team_members for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.team_members tm where tm.team_id = team_members.team_id and tm.user_id = auth.uid()) or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "captains can add team members" on public.team_members for insert to authenticated with check (exists (select 1 from public.teams t where t.id = team_id and (t.captain_id = auth.uid() or t.created_by = auth.uid())));

create policy "users can read groups" on public.groups for select to authenticated using (true);
create policy "admins can manage groups" on public.groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users can read group teams" on public.group_teams for select to authenticated using (true);
create policy "admins can manage group teams" on public.group_teams for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users can read their payments" on public.payments for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.team_members tm where tm.team_id = payments.team_id and tm.user_id = auth.uid()) or public.is_admin());
create policy "captains can create payments" on public.payments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.team_members tm where tm.team_id = payments.team_id and tm.user_id = auth.uid()));

create or replace function public.find_profile_by_email(search_email text)
returns table (id uuid, first_name text, last_name text)
language sql security definer set search_path = public
as $$ select p.id, p.first_name, p.last_name from public.profiles p where auth.uid() is not null and lower(p.email) = lower(search_email) limit 1; $$;
revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;