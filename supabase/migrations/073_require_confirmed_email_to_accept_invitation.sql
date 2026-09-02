-- Accepting a team invitation should require a confirmed email, matching
-- team registration (070_custom_email_verification.sql). Supabase's own
-- auth.users.email_confirmed_at is meaningless here (auto-confirmed on
-- every signup) - the app tracks verification itself via
-- profiles.email_verified_at, so that's the flag to check.
-- Declining doesn't need this since it doesn't add the player to a team.

create or replace function public.accept_team_invitation(target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and email_verified_at is not null
  ) then
    raise exception 'Email not confirmed';
  end if;

  update public.team_members
  set status = 'active'
  where team_id = target_team_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No pending invitation found for this team';
  end if;
end;
$$;
