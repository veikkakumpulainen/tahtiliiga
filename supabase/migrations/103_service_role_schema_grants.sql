-- service_role is meant to bypass RLS and have unrestricted access to
-- public schema objects (that's how Supabase provisions every project by
-- default), but this project's service_role is missing the base grants -
-- Edge Functions using the service-role client (supabaseAdmin in
-- _shared/notifications.ts) were getting "permission denied for table
-- teams/leagues/profiles/push_tokens" (42501) even though RLS should never
-- have been consulted for this role. Restore the standard Supabase default:
-- full privileges on everything in public, including tables created later.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant all privileges on functions to service_role;
