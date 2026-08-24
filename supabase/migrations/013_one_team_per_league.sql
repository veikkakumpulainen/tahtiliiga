create or replace function public.prevent_duplicate_league_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.team_members current_member
    join public.teams current_team on current_team.id = current_member.team_id
    join public.teams new_team on new_team.id = new.team_id
    where current_member.user_id = new.user_id
      and current_team.league_id = new_team.league_id
      and current_member.team_id <> new.team_id
  ) then
    raise exception 'A user can only belong to one team in the same league';
  end if;
  return new;
end;
$$;

drop trigger if exists one_team_per_league on public.team_members;
create trigger one_team_per_league
before insert or update on public.team_members
for each row execute function public.prevent_duplicate_league_team_member();