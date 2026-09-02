-- A player must be able to have one team in "avoin" and a separate team in
-- "mixty" within the same league. The old rule only scoped by league_id, so
-- it blocked joining the second division entirely - scope it by category too.

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
      and current_team.category = new_team.category
      and current_member.team_id <> new.team_id
  ) then
    raise exception 'A user can only belong to one team in the same league division';
  end if;
  return new;
end;
$$;
