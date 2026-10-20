-- Close direct-REST paths that bypass the RPC checks. The app itself only
-- writes these through security definer functions (create_team_with_members,
-- admin_update_team_roster, mark_email_verified, stripe-webhook), so none of
-- this changes app behavior.

-- 1. Players could insert their own payment row straight as 'paid'. Only
-- admins and the Stripe webhook may mark a payment paid (see src/lib/stripe.ts).
drop policy if exists "captains can create payments" on public.payments;
create policy "captains can create payments" on public.payments
for insert to authenticated with check (
  user_id = auth.uid()
  and payment_status = 'pending'
  and paid_at is null
  and exists (select 1 from public.team_members tm where tm.team_id = payments.team_id and tm.user_id = auth.uid())
);

-- 2. UPDATE on every profiles column let a user set email_verified_at
-- themselves (skipping verification) or edit email / deleted_at. Limit it to
-- the fields ProfileForm edits; role stays guarded by the existing policy.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, phone, gender, skill_level) on public.profiles to authenticated;

-- 3. Captains could update any team column directly (league_id, category,
-- captain_id...) and insert teams without the registration checks in
-- create_team_with_members. Team changes go through RPCs or admins.
drop policy if exists "captains and admins can update teams" on public.teams;
drop policy if exists "admins can update teams" on public.teams;
create policy "admins can update teams" on public.teams
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "captains can create teams" on public.teams;

-- 4. Captains could insert any user into their team as 'active' (status
-- defaults to active), skipping the invitation flow and the 2-3 player limit.
drop policy if exists "captains can add team members" on public.team_members;

-- 5. Supabase grants EXECUTE on new functions to anon and authenticated
-- explicitly, so "revoke ... from public" alone leaves them callable.
-- auto_assign_league_groups has no caller check and reshuffles any league's
-- groups; it's meant to run only via admin_auto_assign_groups and the
-- registration trigger. send_round_reminders is for pg_cron only.
revoke execute on function public.auto_assign_league_groups(uuid) from anon, authenticated;
revoke execute on function public.send_round_reminders() from anon, authenticated;

-- 094 recreated find_profile_by_email after 083 dropped it as an
-- email-enumeration surface. Nothing calls it.
drop function if exists public.find_profile_by_email(text);
