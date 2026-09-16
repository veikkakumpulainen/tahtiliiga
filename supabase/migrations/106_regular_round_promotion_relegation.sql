-- Completing a regular round previously only awarded the round-winner bonus
-- points (043) - it never actually moved any team between groups. The
-- intended ladder: each group's round winner (rank 1) is promoted into the
-- group above, and each group's last-place team is relegated into the group
-- below, for every adjacent "Lohko N" / "Lohko N+1" pair (top/bottom groups
-- have no neighbor on one side, so their winner/last-place simply doesn't
-- move on that side - the join below only pairs groups that actually have
-- an adjacent neighbor). This is symmetric to, and independent of, the
-- existing qualification-round swap (rank 3 vs rank 2), which then plays
-- out the remaining contested middle spot on top of these automatic moves.
--
-- already_moved guards a rare edge case: if team counts don't divide evenly
-- into groups of 4, a leftover group can end up with just one team, which
-- would then be both "the winner" (as the lower neighbor) and "the last
-- place" (as the upper neighbor) in two different adjacent pairs in the
-- same transaction - skip a team's second move rather than bounce it twice.

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
        select id, (regexp_match(name, '^Lohko ([0-9]+)$'))[1]::integer as group_number
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
      join numbered_groups lower_group on lower_group.group_number = upper_group.group_number + 1
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
