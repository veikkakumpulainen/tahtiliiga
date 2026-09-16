-- 086_push_notifications.sql added RLS policies for push_tokens but never
-- granted the underlying table privileges to the authenticated role (same
-- omission fixed for community_messages in 093_community_messages_grants.sql).
-- Without a table-level GRANT, Postgres denies the operation before RLS is
-- even considered, surfacing as "permission denied for table push_tokens".

grant select, insert, update on public.push_tokens to authenticated;
