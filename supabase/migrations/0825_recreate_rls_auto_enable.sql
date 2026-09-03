-- public.rls_auto_enable() is referenced by 083_lock_down_internal_functions.sql
-- (which revokes its anon/authenticated EXECUTE grant) but was never defined
-- by any migration file - it was created directly against production
-- through the Supabase dashboard at some point, so replaying this history
-- from scratch fails when 083 tries to revoke a function that doesn't
-- exist. Its name, zero-argument signature, plpgsql/security-definer shape
-- (confirmed via the Security Advisor's function listing) and the
-- observed production behavior - new tables end up with row level security
-- enabled but no policies, e.g. league_round_bonus_points - all point to an
-- event trigger that auto-enables RLS on every newly created table.
-- Reconstructed here so a from-scratch replay matches production.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands() where command_tag = 'CREATE TABLE'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists rls_auto_enable_trigger;
create event trigger rls_auto_enable_trigger
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.rls_auto_enable();
