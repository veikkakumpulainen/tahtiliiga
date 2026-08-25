alter table public.matches
  add column if not exists home_player_one_id uuid references public.profiles(id),
  add column if not exists home_player_two_id uuid references public.profiles(id),
  add column if not exists away_player_one_id uuid references public.profiles(id),
  add column if not exists away_player_two_id uuid references public.profiles(id);

create or replace function public.validate_match_lineup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.home_player_one_id is null) <> (new.home_player_two_id is null)
    or (new.away_player_one_id is null) <> (new.away_player_two_id is null) then
    raise exception 'A match lineup must contain exactly two players per selected team';
  end if;

  if new.home_player_one_id is not null and (
    new.home_player_one_id = new.home_player_two_id
    or not exists (select 1 from public.team_members where team_id = new.home_team_id and user_id in (new.home_player_one_id, new.home_player_two_id))
    or (select count(*) from public.team_members where team_id = new.home_team_id and user_id in (new.home_player_one_id, new.home_player_two_id)) <> 2
  ) then
    raise exception 'Home lineup players must belong to the home team';
  end if;

  if new.away_player_one_id is not null and (
    new.away_player_one_id = new.away_player_two_id
    or not exists (select 1 from public.team_members where team_id = new.away_team_id and user_id in (new.away_player_one_id, new.away_player_two_id))
    or (select count(*) from public.team_members where team_id = new.away_team_id and user_id in (new.away_player_one_id, new.away_player_two_id)) <> 2
  ) then
    raise exception 'Away lineup players must belong to the away team';
  end if;
  return new;
end;
$$;

drop trigger if exists match_lineup_valid on public.matches;
create trigger match_lineup_valid
before insert or update of home_player_one_id, home_player_two_id, away_player_one_id, away_player_two_id on public.matches
for each row execute function public.validate_match_lineup();

create or replace function public.get_active_match_lineup_options(target_match_id uuid)
returns table (team_id uuid, player_id uuid, first_name text, last_name text)
language sql
security definer
set search_path = public
as $$
  select membership.team_id, profile.id, profile.first_name, profile.last_name
  from public.matches match
  join public.league_rounds round on round.id = match.league_round_id and round.status = 'active'
  join public.team_members membership on membership.team_id in (match.home_team_id, match.away_team_id)
  join public.profiles profile on profile.id = membership.user_id
  where match.id = target_match_id
    and (public.is_admin() or public.is_team_member(match.home_team_id) or public.is_team_member(match.away_team_id));
$$;

revoke all on function public.get_active_match_lineup_options(uuid) from public;
grant execute on function public.get_active_match_lineup_options(uuid) to authenticated;