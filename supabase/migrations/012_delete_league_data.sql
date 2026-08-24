create or replace function public.delete_league_with_data(target_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team_ids uuid[];
  group_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete leagues';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
  into team_ids
  from public.teams
  where league_id = target_league_id;

  select coalesce(array_agg(id), '{}'::uuid[])
  into group_ids
  from public.groups
  where league_id = target_league_id;

  delete from public.group_messages where group_id = any(group_ids);
  delete from public.matches where league_id = target_league_id;
  delete from public.payments where team_id = any(team_ids);
  delete from public.team_members where team_id = any(team_ids);
  delete from public.group_teams where group_id = any(group_ids);
  delete from public.groups where id = any(group_ids);
  delete from public.teams where id = any(team_ids);
  delete from public.leagues where id = target_league_id;
end;
$$;

revoke all on function public.delete_league_with_data(uuid) from public;
grant execute on function public.delete_league_with_data(uuid) to authenticated;