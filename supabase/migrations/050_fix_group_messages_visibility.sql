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
  select
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
    and (
      public.is_admin()
      or exists (
        select 1
        from public.group_teams viewer_gt
        join public.team_members viewer_tm on viewer_tm.team_id = viewer_gt.team_id
        where viewer_gt.group_id = target_group_id
          and viewer_tm.user_id = auth.uid()
      )
    )
  order by gm.created_at;
$$;

revoke all on function public.get_group_messages(uuid) from public;
grant execute on function public.get_group_messages(uuid) to authenticated;
