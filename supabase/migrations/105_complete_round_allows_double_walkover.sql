-- complete_league_round() (043_regular_round_tiebreakers.sql) predates the
-- double_walkover status (096_double_walkover_matches.sql) and still
-- required every match to be exactly 'completed' before a round could end -
-- a match marked "not played by either team" is a final, resolved outcome
-- (by design it just carries no points/played-count, per 096's comment) but
-- was permanently blocking round completion since its status can never
-- become 'completed'. Accept both as "resolved" for this check.

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
