-- 090_community_messages.sql added RLS policies for community_messages but
-- never granted the underlying table privileges to the authenticated role
-- (unlike group_messages, which got this in 006_grants_and_rpc_permissions.sql).
-- Without a table-level GRANT, Postgres denies the operation before RLS is
-- even considered, surfacing as "permission denied for table
-- community_messages" / a 403 from PostgREST.

grant select, insert, delete on public.community_messages to authenticated;
