-- A team needs at least 2 members to be viable. If a decline drops the
-- roster (active + still-pending invites) below 2, the team can no longer
-- reach that minimum, so remove it. A 3-person team with one decline still
-- has 2 members left (captain + the other pending invite), so it survives
-- until a second decline actually breaks it.

create or replace function public.decline_team_invitation(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_count integer;
begin
  delete from public.team_members
  where team_id = target_team_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending invitation found for this team';
  end if;

  select count(*) into remaining_count from public.team_members where team_id = target_team_id;
  if remaining_count < 2 then
    delete from public.teams where id = target_team_id;
  end if;
end;
$$;
