-- 112 cleared a group's lohko chat only when that specific group's
-- membership changed, and only at round *completion*. The actual rule is
-- simpler and broader: every time ANY new round starts - regular or
-- qualification, whether or not a given group's teams actually moved -
-- every lohko chat in the league should start empty again. (Tiedotteet /
-- community_messages are a deliberate exception - those are the league's
-- own announcement feed and aren't touched.) Centralize this at round
-- start instead of completion, and drop the narrower per-group logic added
-- in 112.

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

  delete from public.group_messages
  where group_id in (select id from public.groups where league_id = target_league_id);

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
  if not public.is_admin() then raise exception 'Only admins can start rounds'; end if;
  select league_id, start_date into target_league_id, target_round_start_date from public.league_rounds where id = target_round_id and round_type = 'qualification' and status = 'draft';
  if target_league_id is null then raise exception 'The qualification round is not available to start'; end if;
  if exists (select 1 from public.league_rounds where league_id = target_league_id and id <> target_round_id and end_date <= target_round_start_date and status <> 'completed') then raise exception 'Complete the earlier scheduled round before starting this round'; end if;
  if exists (select 1 from public.league_rounds where league_id = target_league_id and status = 'active') then raise exception 'Complete the active round before starting another round'; end if;

  select id into source_round_id from public.league_rounds where league_id = target_league_id and round_type = 'regular' and status = 'completed' and end_date <= target_round_start_date order by end_date desc, created_at desc limit 1;
  if source_round_id is null then raise exception 'Complete a regular round before starting qualification'; end if;

  delete from public.group_messages
  where group_id in (select id from public.groups where league_id = target_league_id);

  with numbered_groups as (
    select id, category, (regexp_match(name, '^Lohko ([0-9]+)$'))[1]::integer as group_number
    from public.groups where league_id = target_league_id
  )
  insert into public.matches (league_id, league_round_id, group_id, home_team_id, away_team_id, status)
  select target_league_id, target_round_id, upper_group.id, upper_third.team_id, lower_second.team_id, 'scheduled'
  from numbered_groups upper_group
  join numbered_groups lower_group on lower_group.group_number = upper_group.group_number + 1 and lower_group.category = upper_group.category
  join public.get_regular_round_group_rankings(source_round_id) upper_third on upper_third.group_id = upper_group.id and upper_third.rank_position = 3
  join public.get_regular_round_group_rankings(source_round_id) lower_second on lower_second.group_id = lower_group.id and lower_second.rank_position = 2
  where upper_group.group_number is not null;

  update public.league_rounds set status = 'active' where id = target_round_id;
end;
$$;

-- Revert 112's completion-time clearing now that round *start* handles it
-- uniformly for every round type (this is otherwise identical to
-- 107_qualification_pairing_scoped_by_category.sql's version).
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
  promotion_pair record;
  lower_group_id uuid;
  already_moved uuid[] := array[]::uuid[];
begin
  if not public.is_admin() then raise exception 'Only admins can complete rounds'; end if;
  select league_id, round_type into target_league_id, target_round_type from public.league_rounds where id = target_round_id and status = 'active';
  if target_league_id is null then raise exception 'The round is not active'; end if;
  if exists (select 1 from public.matches where league_round_id = target_round_id and status not in ('completed', 'double_walkover')) then raise exception 'Complete every match before ending the round'; end if;

  if target_round_type = 'regular' then
    insert into public.league_round_bonus_points (league_round_id, team_id, points)
    select target_round_id, team_id, 2
    from public.get_regular_round_group_rankings(target_round_id)
    where rank_position = 1
    on conflict (league_round_id, team_id) do nothing;

    for promotion_pair in
      with numbered_groups as (
        select id, category, (regexp_match(name, '^Lohko ([0-9]+)$'))[1]::integer as group_number
        from public.groups where league_id = target_league_id
      ), rankings as (
        select * from public.get_regular_round_group_rankings(target_round_id)
      ), last_place as (
        select group_id, team_id from rankings r
        where rank_position = (select max(r2.rank_position) from rankings r2 where r2.group_id = r.group_id)
      )
      select
        upper_group.id as upper_group_id,
        lower_group.id as lower_group_id,
        promoted.team_id as promoted_team_id,
        relegated.team_id as relegated_team_id
      from numbered_groups upper_group
      join numbered_groups lower_group on lower_group.group_number = upper_group.group_number + 1 and lower_group.category = upper_group.category
      join rankings promoted on promoted.group_id = lower_group.id and promoted.rank_position = 1
      join last_place relegated on relegated.group_id = upper_group.id
      where upper_group.group_number is not null and lower_group.group_number is not null
    loop
      if promotion_pair.promoted_team_id = any(already_moved) or promotion_pair.relegated_team_id = any(already_moved) then
        continue;
      end if;
      delete from public.group_teams where team_id in (promotion_pair.promoted_team_id, promotion_pair.relegated_team_id);
      insert into public.group_teams (group_id, team_id) values
        (promotion_pair.upper_group_id, promotion_pair.promoted_team_id),
        (promotion_pair.lower_group_id, promotion_pair.relegated_team_id);
      already_moved := already_moved || promotion_pair.promoted_team_id || promotion_pair.relegated_team_id;
    end loop;
  else
    for qualification_match in select id, group_id, home_team_id, away_team_id from public.matches where league_round_id = target_round_id and away_score > home_score loop
      select group_id into lower_group_id from public.group_teams where team_id = qualification_match.away_team_id;
      if lower_group_id is null then raise exception 'Qualification teams must remain in their current groups until the round is completed'; end if;
      delete from public.group_teams where team_id in (qualification_match.home_team_id, qualification_match.away_team_id);
      insert into public.group_teams (group_id, team_id) values (qualification_match.group_id, qualification_match.away_team_id), (lower_group_id, qualification_match.home_team_id);
    end loop;
  end if;

  update public.league_rounds set status = 'completed' where id = target_round_id;
end;
$$;
