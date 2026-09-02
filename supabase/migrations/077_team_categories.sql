-- Add an "avoin" / "mixty" division to teams, so one league can run both a
-- free-pairing division and a mixed-doubles (one man + one woman) division
-- side by side, each with its own group draw and standings.

alter table public.teams
  add column if not exists category text not null default 'avoin' check (category in ('avoin', 'mixty'));

alter table public.groups
  add column if not exists category text not null default 'avoin' check (category in ('avoin', 'mixty'));

-- Groups were only unique per (league_id, name); both divisions need their
-- own "Lohko 1", "Lohko 2", ... sequence within the same league.
alter table public.groups
  drop constraint if exists groups_league_id_name_key;

alter table public.groups
  drop constraint if exists groups_league_id_category_name_key;

alter table public.groups
  add constraint groups_league_id_category_name_key unique (league_id, category, name);

-- Automatic group allocation now buckets teams into groups of four per
-- category instead of one shared sequence for the whole league.
create or replace function public.assign_registered_teams_to_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  league_status text;
  allocation_enabled boolean;
  category_row record;
  team_count integer;
  group_number integer;
  target_group_id uuid;
  team_record record;
begin
  -- Serialise registrations for the same league before recalculating its groups.
  perform pg_advisory_xact_lock(hashtext(new.league_id::text));

  select status, automatic_group_allocation into league_status, allocation_enabled
  from public.leagues
  where id = new.league_id;

  if league_status <> 'registration_open' or not allocation_enabled then
    return new;
  end if;

  perform set_config('tahtiliiga.automatic_group_allocation', 'true', true);

  for category_row in
    select distinct category from public.teams where league_id = new.league_id
  loop
    select count(*) into team_count
    from public.teams
    where league_id = new.league_id and category = category_row.category;

    for group_number in 1..ceil(team_count / 4.0)::integer loop
      insert into public.groups (league_id, category, name, status)
      values (new.league_id, category_row.category, format('Lohko %s', group_number), 'draft')
      on conflict (league_id, category, name) do nothing;
    end loop;

    delete from public.group_teams assignment
    using public.groups league_group
    where assignment.group_id = league_group.id
      and league_group.league_id = new.league_id
      and league_group.category = category_row.category;

    for team_record in
      select
        id,
        ceil(row_number() over (
          order by case skill_level when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 when 'E' then 5 when 'Aloittelija' then 6 else 7 end, created_at, id
        ) / 4.0)::integer as group_number
      from public.teams
      where league_id = new.league_id and category = category_row.category
    loop
      select id into target_group_id
      from public.groups
      where league_id = new.league_id
        and category = category_row.category
        and name = format('Lohko %s', team_record.group_number);

      insert into public.group_teams (group_id, team_id)
      values (target_group_id, team_record.id);
    end loop;
  end loop;

  return new;
end;
$$;

-- Team registration now requires a category, and a "mixty" team must have
-- at least one male and one female player among its registered members.
drop function if exists public.create_team_with_members(uuid, text, text, text, uuid, uuid[]);

create or replace function public.create_team_with_members(
  target_league_id uuid,
  team_name text,
  team_skill_level text,
  team_skill_description text,
  target_captain_id uuid,
  member_ids uuid[],
  target_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team_id uuid;
  male_count integer;
  female_count integer;
begin
  if auth.uid() is null or cardinality(member_ids) not between 2 and 3
    or target_captain_id <> all(member_ids)
    or (not public.is_admin() and auth.uid() <> all(member_ids)) then
    raise exception 'Invalid team members or captain';
  end if;

  if target_category is null or target_category not in ('avoin', 'mixty') then
    raise exception 'Valitse sarja: Avoin vai Mixty.';
  end if;

  if (select count(distinct member_id) from unnest(member_ids) as member_id) <> cardinality(member_ids) then
    raise exception 'A player can only be added once';
  end if;

  if not public.is_admin() and not exists (
    select 1 from public.leagues where id = target_league_id and status = 'registration_open'
  ) then
    raise exception 'League is not open for registration';
  end if;

  if not public.is_admin() and not exists (
    select 1 from public.profiles where id = auth.uid() and email_verified_at is not null
  ) then
    raise exception 'Email not confirmed';
  end if;

  if target_category = 'mixty' then
    select count(*) filter (where gender = 'male'), count(*) filter (where gender = 'female')
    into male_count, female_count
    from public.profiles
    where id = any(member_ids);

    if male_count < 1 or female_count < 1 then
      raise exception 'Mixty-joukkueessa tulee olla sekä mies- että naispelaaja.';
    end if;
  end if;

  insert into public.teams (league_id, name, skill_level, skill_description, captain_id, created_by, category)
  values (target_league_id, btrim(team_name), team_skill_level, nullif(btrim(team_skill_description), ''), target_captain_id, auth.uid(), target_category)
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, is_captain, status)
  select new_team_id, member_id, member_id = target_captain_id, 'active'
  from unnest(member_ids) as member_id;

  return new_team_id;
end;
$$;

revoke all on function public.create_team_with_members(uuid, text, text, text, uuid, uuid[], text) from public;
grant execute on function public.create_team_with_members(uuid, text, text, text, uuid, uuid[], text) to authenticated;

-- Standings/rosters become category-scoped.
drop function if exists public.get_league_standings_with_tiebreakers(uuid);

create or replace function public.get_league_standings_with_tiebreakers(target_league_id uuid, target_category text)
returns table (group_id uuid, group_name text, team_id uuid, team_name text, played bigint, wins bigint, losses bigint, points bigint, rank_position integer)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select public.is_admin() or exists (
      select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing'
    ) as allowed
  ), active_round as (
    select id from public.league_rounds where league_id = target_league_id and round_type = 'regular' and status = 'active' order by start_date desc, created_at desc limit 1
  )
  select ranking.group_id, league_group.name, ranking.team_id, ranking.team_name, ranking.played, ranking.wins, ranking.losses, ranking.points, ranking.rank_position
  from authorized
  join active_round on true
  join public.get_regular_round_group_rankings(active_round.id) ranking on true
  join public.groups league_group on league_group.id = ranking.group_id
  where authorized.allowed and league_group.category = target_category;
$$;

drop function if exists public.get_league_total_standings(uuid);

create or replace function public.get_league_total_standings(target_league_id uuid, target_category text)
returns table (team_id uuid, team_name text, played bigint, wins bigint, losses bigint, points bigint)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select public.is_admin() or exists (
      select 1 from public.leagues league where league.id = target_league_id and league.status = 'ongoing'
    ) as allowed
  )
  select
    team.id,
    team.name,
    count(match.id) filter (where match.status = 'completed'),
    count(match.id) filter (where match.status = 'completed' and ((match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score))),
    count(match.id) filter (where match.status = 'completed' and ((match.home_team_id = team.id and match.home_score < match.away_score) or (match.away_team_id = team.id and match.away_score < match.home_score))),
    coalesce(sum(case
      when match.status <> 'completed' then 0
      when round.round_type = 'qualification' and ((match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score)) then 1
      when round.round_type = 'qualification' then 0
      else case when match.home_team_id = team.id then match.home_score else match.away_score end + case when (match.home_team_id = team.id and match.home_score > match.away_score) or (match.away_team_id = team.id and match.away_score > match.home_score) then 2 when match.walkover_winner_id is null then 1 else 0 end
    end), 0) + coalesce((select sum(bonus.points) from public.league_round_bonus_points bonus where bonus.team_id = team.id), 0) as points
  from authorized
  join public.teams team on team.league_id = target_league_id and team.category = target_category
  left join public.matches match on match.league_id = target_league_id and team.id in (match.home_team_id, match.away_team_id)
  left join public.league_rounds round on round.id = match.league_round_id
  where authorized.allowed
  group by team.id, team.name;
$$;

revoke all on function public.get_league_standings_with_tiebreakers(uuid, text) from public;
revoke all on function public.get_league_total_standings(uuid, text) from public;
grant execute on function public.get_league_standings_with_tiebreakers(uuid, text) to authenticated, anon;
grant execute on function public.get_league_total_standings(uuid, text) to authenticated, anon;

drop function if exists public.get_league_team_rosters(uuid);

create or replace function public.get_league_team_rosters(target_league_id uuid)
returns table (team_id uuid, team_name text, category text, player_id uuid, first_name text, last_name text, is_captain boolean, status text)
language sql
security definer
set search_path = public
as $$
  select team.id, team.name, team.category, profile.id, profile.first_name, profile.last_name, profile.id = team.captain_id, membership.status
  from public.teams team
  join public.team_members membership on membership.team_id = team.id
  join public.profiles profile on profile.id = membership.user_id
  where auth.uid() is not null
    and team.league_id = target_league_id
  order by team.created_at desc, (profile.id = team.captain_id) desc, membership.status, profile.first_name, profile.last_name;
$$;

revoke all on function public.get_league_team_rosters(uuid) from public;
grant execute on function public.get_league_team_rosters(uuid) to authenticated, anon;
