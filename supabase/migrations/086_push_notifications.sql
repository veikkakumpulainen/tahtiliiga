create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

drop trigger if exists push_tokens_updated_at on public.push_tokens;
create trigger push_tokens_updated_at before update on public.push_tokens for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

create policy "users manage their own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.search_players_for_notification(search_query text)
returns table (id uuid, first_name text, last_name text)
language sql security definer set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name
  from public.profiles profile
  where public.is_admin()
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
  order by profile.first_name, profile.last_name
  limit 5;
$$;

revoke all on function public.search_players_for_notification(text) from public;
grant execute on function public.search_players_for_notification(text) to authenticated;
