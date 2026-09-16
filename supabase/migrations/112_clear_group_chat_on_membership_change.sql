-- group_messages is scoped to group_id, but the "Lohko N" group row itself
-- is permanent (077_team_categories.sql) - only its group_teams membership
-- changes each round via promotion/relegation (106) or the qualification
-- swap (031/108). That left old messages visible to whichever new teams
-- landed in that group, since nothing ever cleared them. Wipe a group's
-- chat the moment its membership actually changes as part of completing a
-- round, so a new round with new/moved teams always starts from an empty
-- lohko chat (qualification_messages doesn't need the same treatment -
-- every round's matches are fresh rows, so match_id already scopes that
-- chat to one specific round with no leakage across rounds).

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
  affected_group_ids uuid[] := array[]::uuid[];
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
      affected_group_ids := affected_group_ids || promotion_pair.upper_group_id || promotion_pair.lower_group_id;
    end loop;
  else
    for qualification_match in select id, group_id, home_team_id, away_team_id from public.matches where league_round_id = target_round_id and away_score > home_score loop
      select group_id into lower_group_id from public.group_teams where team_id = qualification_match.away_team_id;
      if lower_group_id is null then raise exception 'Qualification teams must remain in their current groups until the round is completed'; end if;
      delete from public.group_teams where team_id in (qualification_match.home_team_id, qualification_match.away_team_id);
      insert into public.group_teams (group_id, team_id) values (qualification_match.group_id, qualification_match.away_team_id), (lower_group_id, qualification_match.home_team_id);
      affected_group_ids := affected_group_ids || qualification_match.group_id || lower_group_id;
    end loop;
  end if;

  if array_length(affected_group_ids, 1) > 0 then
    delete from public.group_messages where group_id = any(affected_group_ids);
  end if;

  update public.league_rounds set status = 'completed' where id = target_round_id;
end;
$$;
