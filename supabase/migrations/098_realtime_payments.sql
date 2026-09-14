-- Lets the app's own-fee payment status update live via postgres_changes
-- instead of requiring a manual refresh (there's no "reload page" in a
-- native app build once the user closes the in-app Stripe browser).
alter publication supabase_realtime add table public.payments;
