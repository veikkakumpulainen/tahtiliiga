alter table public.league_rounds
  add column if not exists round_type text not null default 'regular'
  check (round_type in ('regular', 'qualification'));

alter table public.league_rounds
  add column if not exists status text not null default 'draft'
  check (status in ('draft', 'active', 'completed'));

alter table public.matches
  add column if not exists league_round_id uuid references public.league_rounds(id) on delete cascade;

drop index if exists public.matches_group_pair_unique_idx;
create unique index if not exists matches_round_group_pair_unique_idx
  on public.matches (league_round_id, group_id, least(home_team_id, away_team_id), greatest(home_team_id, away_team_id));

create or replace function public.start_regular_round(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  target_round_start_date date;
begin
  if not public.is_admin() then
    raise exception 'Only admins can start rounds';
  end if;

  select league_id, start_date into target_league_id, target_round_start_date
  from public.league_rounds
  where id = target_round_id
    and round_type = 'regular'
    and status = 'draft';

  if target_league_id is null then
    raise exception 'The regular round is not available to start';
  end if;

  if exists (
    select 1 from public.league_rounds
    where league_id = target_league_id
      and id <> target_round_id
      and end_date <= target_round_start_date
      and status <> 'completed'
  ) then
    raise exception 'Complete the earlier scheduled round before starting this round';
  end if;

  if exists (
    select 1 from public.league_rounds
    where league_id = target_league_id
      and status = 'active'
  ) then
    raise exception 'Complete the active round before starting another round';
  end if;

  insert into public.matches (league_id, league_round_id, group_id, home_team_id, away_team_id, status)
  select
    target_league_id,
    target_round_id,
    group_team.group_id,
    group_team.team_id,
    opponent.team_id,
    'scheduled'
  from public.group_teams group_team
  join public.group_teams opponent
    on opponent.group_id = group_team.group_id
    and opponent.team_id > group_team.team_id
  join public.groups league_group on league_group.id = group_team.group_id
  where league_group.league_id = target_league_id;

  update public.league_rounds
  set status = 'active'
  where id = target_round_id;
end;
$$;

create or replace function public.start_qualification_round(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  target_round_start_date date;
  source_round_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can start rounds';
  end if;

  select league_id, start_date into target_league_id, target_round_start_date
  from public.league_rounds
  where id = target_round_id
    and round_type = 'qualification'
    and status = 'draft';

  if target_league_id is null then
    raise exception 'The qualification round is not available to start';
  end if;

  if exists (
    select 1 from public.league_rounds
    where league_id = target_league_id
      and id <> target_round_id
      and end_date <= target_round_start_date
      and status <> 'completed'
  ) then
    raise exception 'Complete the earlier scheduled round before starting this round';
  end if;

  if exists (
    select 1 from public.league_rounds
    where league_id = target_league_id
      and status = 'active'
  ) then
    raise exception 'Complete the active round before starting another round';
  end if;

  select id into source_round_id
  from public.league_rounds
  where league_id = target_league_id
    and round_type = 'regular'
    and status = 'completed'
    and end_date <= (select start_date from public.league_rounds where id = target_round_id)
  order by end_date desc, created_at desc
  limit 1;

  if source_round_id is null then
    raise exception 'Complete a regular round before starting qualification';
  end if;

  if exists (
    select 1 from public.matches
    where league_round_id = source_round_id
      and status <> 'completed'
  ) then
    raise exception 'All regular-round matches must be completed before qualification';
  end if;

  with standings as (
    select
      league_group.id as group_id,
      league_group.name as group_name,
      group_team.team_id,
      team.name as team_name,
      coalesce(sum(
        case when match.home_team_id = team.id then match.home_score else match.away_score end
        + case
            when (match.home_team_id = team.id and match.home_score > match.away_score)
              or (match.away_team_id = team.id and match.away_score > match.home_score) then 2
            when match.walkover_winner_id is null then 1
            else 0
          end
      ), 0) as points,
      count(match.id) filter (
        where (match.home_team_id = team.id and match.home_score > match.away_score)
          or (match.away_team_id = team.id and match.away_score > match.home_score)
      ) as wins
    from public.groups league_group
    join public.group_teams group_team on group_team.group_id = league_group.id
    join public.teams team on team.id = group_team.team_id
    left join public.matches match on match.league_round_id = source_round_id
      and match.status = 'completed'
      and team.id in (match.home_team_id, match.away_team_id)
    where league_group.league_id = target_league_id
    group by league_group.id, league_group.name, group_team.team_id, team.name
  ), ranked as (
    select *, row_number() over (partition by group_id order by points desc, wins desc, team_name) as position
    from standings
  ), numbered_groups as (
    select id, (regexp_match(name, '^Lohko ([0-9]+)$'))[1]::integer as group_number
    from public.groups
    where league_id = target_league_id
  )
  insert into public.matches (league_id, league_round_id, group_id, home_team_id, away_team_id, status)
  select
    target_league_id,
    target_round_id,
    upper_group.id,
    upper_third.team_id,
    lower_second.team_id,
    'scheduled'
  from numbered_groups upper_group
  join numbered_groups lower_group on lower_group.group_number = upper_group.group_number + 1
  join ranked upper_third on upper_third.group_id = upper_group.id and upper_third.position = 3
  join ranked lower_second on lower_second.group_id = lower_group.id and lower_second.position = 2
  where upper_group.group_number is not null;

  update public.league_rounds
  set status = 'active'
  where id = target_round_id;
end;
$$;

create or replace function public.complete_league_round(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  target_round_type text;
  qualification_match record;
  lower_group_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can complete rounds';
  end if;

  select league_id, round_type into target_league_id, target_round_type
  from public.league_rounds
  where id = target_round_id
    and status = 'active';

  if target_league_id is null then
    raise exception 'The round is not active';
  end if;

  if exists (
    select 1 from public.matches
    where league_round_id = target_round_id
      and status <> 'completed'
  ) then
    raise exception 'Complete every match before ending the round';
  end if;

  if target_round_type = 'qualification' then
    for qualification_match in
      select id, group_id, home_team_id, away_team_id, home_score, away_score
      from public.matches
      where league_round_id = target_round_id
        and away_score > home_score
    loop
      select group_id into lower_group_id
      from public.group_teams
      where team_id = qualification_match.away_team_id;

      if lower_group_id is null then
        raise exception 'Qualification teams must remain in their current groups until the round is completed';
      end if;

      delete from public.group_teams
      where team_id in (qualification_match.home_team_id, qualification_match.away_team_id);

      insert into public.group_teams (group_id, team_id)
      values
        (qualification_match.group_id, qualification_match.away_team_id),
        (lower_group_id, qualification_match.home_team_id);
    end loop;
  end if;

  update public.league_rounds
  set status = 'completed'
  where id = target_round_id;
end;
$$;

revoke all on function public.start_regular_round(uuid) from public;
revoke all on function public.start_qualification_round(uuid) from public;
revoke all on function public.complete_league_round(uuid) from public;
grant execute on function public.start_regular_round(uuid) to authenticated;
grant execute on function public.start_qualification_round(uuid) to authenticated;
grant execute on function public.complete_league_round(uuid) to authenticated;