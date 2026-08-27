-- Locking registration is the natural point to stop waiting on outstanding
-- invitations: a team needs at least 2 active (accepted) members to be
-- viable, regardless of how many pending invites it also has.

create or replace function public.lock_league_registration(target_league_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can lock league registration';
  end if;

  with incomplete_teams as (
    select team.id
    from public.teams team
    where team.league_id = target_league_id
      and (
        select count(*) from public.team_members membership
        where membership.team_id = team.id and membership.status = 'active'
      ) < 2
  ), deleted as (
    delete from public.teams where id in (select id from incomplete_teams)
    returning id
  )
  select count(*) into removed_count from deleted;

  update public.leagues set status = 'registration_closed' where id = target_league_id;

  return removed_count;
end;
$$;

revoke all on function public.lock_league_registration(uuid) from public;
grant execute on function public.lock_league_registration(uuid) to authenticated;
