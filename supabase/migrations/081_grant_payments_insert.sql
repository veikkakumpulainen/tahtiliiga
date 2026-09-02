-- The "captains can create payments" RLS policy (000_initial_schema.sql) was
-- never paired with an actual table-level INSERT grant - only SELECT
-- (006_grants_and_rpc_permissions.sql) and DELETE (007_admin_management.sql)
-- were ever granted to `authenticated`. Without this grant, RLS is never even
-- reached and every insert is rejected outright.

grant insert on public.payments to authenticated;
