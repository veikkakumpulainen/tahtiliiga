-- The stripe-webhook Edge Function uses the service role key to mark a
-- payment paid, but `payments` never had table-level grants for
-- service_role either (same gap as authenticated's missing INSERT in
-- 081_grant_payments_insert.sql) - RLS bypass does not skip GRANT checks.

grant select, update on public.payments to service_role;
