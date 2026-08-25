create or replace function public.require_lineups_for_completed_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  home_member_count integer;
  away_member_count integer;
begin
  if new.status <> 'completed' or new.walkover_winner_id is not null then
    return new;
  end if;

  select count(*) into home_member_count
  from public.team_members
  where team_id = new.home_team_id;

  select count(*) into away_member_count
  from public.team_members
  where team_id = new.away_team_id;

  if (home_member_count > 2 and (new.home_player_one_id is null or new.home_player_two_id is null))
    or (away_member_count > 2 and (new.away_player_one_id is null or new.away_player_two_id is null)) then
    raise exception 'Select the playing pair for every team with more than two members before recording the result';
  end if;

  return new;
end;
$$;

drop trigger if exists completed_match_requires_lineups on public.matches;
create trigger completed_match_requires_lineups
before insert or update of status, home_player_one_id, home_player_two_id, away_player_one_id, away_player_two_id on public.matches
for each row execute function public.require_lineups_for_completed_match();