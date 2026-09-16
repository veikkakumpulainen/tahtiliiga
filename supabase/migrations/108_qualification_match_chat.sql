-- Dedicated 1-on-1 chat scoped to a single qualification match (exactly the
-- two teams playing each other), separate from group_messages (which is
-- scoped to a whole "Lohko" of up to 4 teams and isn't the right shape for
-- this - see the client-side change for why the old lohko chat is closed
-- entirely during a qualification round instead of reused).

create table if not exists public.qualification_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists qualification_messages_match_idx on public.qualification_messages (match_id, created_at);

alter table public.qualification_messages enable row level security;

drop policy if exists "match participants can read qualification chat" on public.qualification_messages;
create policy "match participants can read qualification chat" on public.qualification_messages
for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.matches m
    where m.id = qualification_messages.match_id
      and (public.is_team_member(m.home_team_id) or public.is_team_member(m.away_team_id))
  )
);

drop policy if exists "match participants can send qualification chat" on public.qualification_messages;
create policy "match participants can send qualification chat" on public.qualification_messages
for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.matches m
    where m.id = qualification_messages.match_id
      and (public.is_team_member(m.home_team_id) or public.is_team_member(m.away_team_id))
  )
);

grant select, insert on public.qualification_messages to authenticated;

create or replace function public.get_qualification_messages(target_match_id uuid)
returns table (
  id uuid,
  message text,
  created_at timestamptz,
  user_id uuid,
  sender_first_name text,
  sender_last_name text,
  team_name text
)
language sql
security definer
set search_path = public
as $$
  select
    qm.id, qm.message, qm.created_at, qm.user_id,
    p.first_name, p.last_name, t.name
  from public.qualification_messages qm
  join public.matches m on m.id = qm.match_id
  join public.team_members tm on tm.user_id = qm.user_id and tm.team_id in (m.home_team_id, m.away_team_id)
  join public.profiles p on p.id = qm.user_id
  join public.teams t on t.id = tm.team_id
  where qm.match_id = target_match_id
    and (public.is_admin() or public.is_team_member(m.home_team_id) or public.is_team_member(m.away_team_id))
  order by qm.created_at;
$$;

revoke all on function public.get_qualification_messages(uuid) from public;
grant execute on function public.get_qualification_messages(uuid) to authenticated;

-- Lets the client ask "does my team have a qualification match this round,
-- and who is it against" without needing direct table access to matches/
-- league_rounds just to answer that one question.
create or replace function public.get_my_qualification_match(target_team_id uuid)
returns table (
  match_id uuid,
  opponent_team_id uuid,
  opponent_team_name text,
  is_home boolean
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    case when m.home_team_id = target_team_id then m.away_team_id else m.home_team_id end,
    case when m.home_team_id = target_team_id then away_team.name else home_team.name end,
    m.home_team_id = target_team_id
  from public.matches m
  join public.league_rounds r on r.id = m.league_round_id and r.round_type = 'qualification' and r.status = 'active'
  join public.teams home_team on home_team.id = m.home_team_id
  join public.teams away_team on away_team.id = m.away_team_id
  where (m.home_team_id = target_team_id or m.away_team_id = target_team_id)
    and (public.is_admin() or public.is_team_member(target_team_id))
  limit 1;
$$;

revoke all on function public.get_my_qualification_match(uuid) from public;
grant execute on function public.get_my_qualification_match(uuid) to authenticated;
