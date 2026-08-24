create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  venue text check (venue is null or char_length(btrim(venue)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check ((status = 'completed' and home_score is not null and away_score is not null) or status <> 'completed')
);

create index if not exists matches_group_idx on public.matches (group_id, scheduled_at);
create unique index if not exists matches_group_pair_unique_idx
  on public.matches (group_id, least(home_team_id, away_team_id), greatest(home_team_id, away_team_id));
alter table public.matches enable row level security;

create or replace function public.prevent_match_structure_change()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if not public.is_admin() and (new.group_id <> old.group_id or new.home_team_id <> old.home_team_id or new.away_team_id <> old.away_team_id or new.league_id <> old.league_id) then
    raise exception 'Only admins can change match teams or group';
  end if;
  return new;
end;
$$;

drop trigger if exists match_structure_immutable on public.matches;
create trigger match_structure_immutable before update on public.matches for each row execute function public.prevent_match_structure_change();

create policy "group members can read matches" on public.matches for select to authenticated using (
  exists (select 1 from public.group_teams gt join public.team_members tm on tm.team_id = gt.team_id where gt.group_id = matches.group_id and tm.user_id = auth.uid())
  or public.is_admin()
);

create policy "admins can create matches" on public.matches for insert to authenticated with check (public.is_admin());

create policy "own team members can update matches" on public.matches for update to authenticated using (
  exists (select 1 from public.group_teams gt join public.team_members tm on tm.team_id = gt.team_id where gt.group_id = matches.group_id and tm.user_id = auth.uid() and gt.team_id in (matches.home_team_id, matches.away_team_id))
) with check (
  exists (select 1 from public.group_teams gt join public.team_members tm on tm.team_id = gt.team_id where gt.group_id = matches.group_id and tm.user_id = auth.uid() and gt.team_id in (matches.home_team_id, matches.away_team_id))
);