-- is_team_member() was tightened in 059_team_invitations.sql to only count
-- 'active' members, which is correct for match/lineup gating. But the teams
-- select policy also relies on is_team_member(), so a player who has only a
-- pending invitation lost the ability to read their own team row - and with
-- it, anything joined through teams (e.g. league_rounds), such as the round
-- schedule on the pending invitation card.
--
-- Add a status-agnostic participant check for read-only visibility of a
-- team a player belongs to (pending or active), without touching
-- is_team_member() itself.

create or replace function public.is_team_participant(target_team_id uuid)
returns boolean language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_team_participant(uuid) from public;
grant execute on function public.is_team_participant(uuid) to authenticated;

drop policy if exists "users can read visible teams" on public.teams;
create policy "users can read visible teams" on public.teams
for select to authenticated using (
  created_by = auth.uid()
  or captain_id = auth.uid()
  or public.is_team_participant(id)
  or public.is_admin()
);
