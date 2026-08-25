create or replace function public.admin_update_team_roster(
  target_team_id uuid,
  removed_user_id uuid default null,
  added_user_id uuid default null,
  new_captain_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
  target_league_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage team rosters';
  end if;

  select league_id into target_league_id
  from public.teams
  where id = target_team_id;
  if target_league_id is null then
    raise exception 'Team not found';
  end if;

  if removed_user_id is not null and not exists (
    select 1 from public.team_members where team_id = target_team_id and user_id = removed_user_id
  ) then
    raise exception 'The removed player does not belong to this team';
  end if;

  if added_user_id is not null and exists (
    select 1 from public.team_members where team_id = target_team_id and user_id = added_user_id
  ) then
    raise exception 'The added player already belongs to this team';
  end if;

  if removed_user_id is not null then
    delete from public.team_members where team_id = target_team_id and user_id = removed_user_id;
  end if;

  if added_user_id is not null then
    insert into public.team_members (team_id, user_id, is_captain)
    values (target_team_id, added_user_id, false);
  end if;

  select count(*) into member_count
  from public.team_members
  where team_id = target_team_id;
  if member_count not between 2 and 3 then
    raise exception 'A team must have two or three players';
  end if;

  if new_captain_id is not null then
    if not exists (select 1 from public.team_members where team_id = target_team_id and user_id = new_captain_id) then
      raise exception 'The captain must belong to the team';
    end if;
    update public.team_members set is_captain = user_id = new_captain_id where team_id = target_team_id;
    update public.teams set captain_id = new_captain_id where id = target_team_id;
  elsif not exists (select 1 from public.team_members where team_id = target_team_id and is_captain) then
    raise exception 'Choose a new captain before removing the current captain';
  end if;
end;
$$;

revoke all on function public.admin_update_team_roster(uuid, uuid, uuid, uuid) from public;
grant execute on function public.admin_update_team_roster(uuid, uuid, uuid, uuid) to authenticated;