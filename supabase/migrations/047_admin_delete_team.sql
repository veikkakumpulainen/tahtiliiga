create or replace function public.admin_delete_team(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete teams';
  end if;

  delete from public.teams where id = target_team_id;
  if not found then
    raise exception 'Team not found';
  end if;
end;
$$;

revoke all on function public.admin_delete_team(uuid) from public;
grant execute on function public.admin_delete_team(uuid) to authenticated;