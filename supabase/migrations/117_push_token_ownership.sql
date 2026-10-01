-- A device's Expo push token stays the same when a different user logs in on
-- it, but the push_tokens RLS policy only lets a user update their own rows -
-- so the client-side upsert failed (42501) and the device kept receiving the
-- previous user's notifications. Register and unregister through
-- security-definer functions instead: registering moves the token to the
-- calling user, and logging out removes it so a signed-out device gets nothing.

create or replace function public.register_push_token(token text, token_platform text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_tokens (user_id, expo_push_token, platform)
  values (auth.uid(), token, token_platform)
  on conflict (expo_push_token) do update set user_id = excluded.user_id, platform = excluded.platform;
$$;

create or replace function public.unregister_push_token(token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where expo_push_token = token and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.unregister_push_token(text) to authenticated;
