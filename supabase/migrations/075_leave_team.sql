-- A player can voluntarily leave a team they're an active member of, while
-- the league is still open for registration. If they were captain,
-- captaincy passes automatically to another remaining member (preferring an
-- active one) - no separate "choose a new captain" step, unlike the
-- captain-driven roster management in 059_team_invitations.sql. If leaving
-- drops the team below 2 members (active + still-pending invites), the
-- whole registration is removed, same rule as decline_team_invitation.

create or replace function public.leave_team(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was_captain boolean;
  next_captain uuid;
  remaining_count integer;
begin
  if not exists (
    select 1 from public.team_members
    where team_id = target_team_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Not an active member of this team';
  end if;

  if not exists (
    select 1 from public.teams team
    join public.leagues league on league.id = team.league_id
    where team.id = target_team_id and league.status = 'registration_open'
  ) then
    raise exception 'League is not open for registration';
  end if;

  select captain_id = auth.uid() into was_captain from public.teams where id = target_team_id;

  delete from public.team_members where team_id = target_team_id and user_id = auth.uid();

  select count(*) into remaining_count from public.team_members where team_id = target_team_id;

  if remaining_count < 2 then
    delete from public.teams where id = target_team_id;
    return;
  end if;

  if was_captain then
    select user_id into next_captain
    from public.team_members
    where team_id = target_team_id
    order by (status = 'active') desc, created_at asc
    limit 1;

    update public.teams set captain_id = next_captain where id = target_team_id;
    update public.team_members set is_captain = (user_id = next_captain) where team_id = target_team_id;
  end if;
end;
$$;

revoke all on function public.leave_team(uuid) from public;
grant execute on function public.leave_team(uuid) to authenticated;
