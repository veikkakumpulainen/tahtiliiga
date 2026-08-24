create or replace function public.get_group_messages(target_group_id uuid)
returns table (
  id uuid,
  message text,
  created_at timestamptz,
  user_id uuid,
  sender_first_name text,
  team_name text
)
language sql
security definer
set search_path = public
as $$
  select distinct on (gm.id)
    gm.id,
    gm.message,
    gm.created_at,
    gm.user_id,
    p.first_name,
    t.name
  from public.group_messages gm
  join public.group_teams gt on gt.group_id = gm.group_id
  join public.team_members tm on tm.team_id = gt.team_id and tm.user_id = gm.user_id
  join public.profiles p on p.id = gm.user_id
  join public.teams t on t.id = tm.team_id
  where gm.group_id = target_group_id
    and (public.is_team_member(gt.team_id) or public.is_admin())
  order by gm.id, tm.is_captain desc;
$$;

revoke all on function public.get_group_messages(uuid) from public;
grant execute on function public.get_group_messages(uuid) to authenticated;