-- Give every player a short, permanent numeric id (separate from their uuid)
-- so a team captain can tell apart two same-name players when adding them
-- during registration. Assigned by the system only - never editable by the
-- player themselves.

create sequence if not exists public.profiles_player_code_seq;

alter table public.profiles
  add column if not exists player_code integer;

with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.profiles
  where player_code is null
)
update public.profiles profile
set player_code = numbered.rn
from numbered
where profile.id = numbered.id;

select setval('public.profiles_player_code_seq', coalesce((select max(player_code) from public.profiles), 0));

alter table public.profiles
  alter column player_code set default nextval('public.profiles_player_code_seq');

alter table public.profiles
  alter column player_code set not null;

alter table public.profiles
  drop constraint if exists profiles_player_code_key;

alter table public.profiles
  add constraint profiles_player_code_key unique (player_code);

create or replace function public.prevent_player_code_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() and new.player_code <> old.player_code then
    raise exception 'Player code cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists player_code_immutable on public.profiles;
create trigger player_code_immutable
before update on public.profiles
for each row execute function public.prevent_player_code_change();

-- Surface the code in the player search used during team registration.
drop function if exists public.search_profiles_by_name(text, uuid);

create or replace function public.search_profiles_by_name(search_query text, target_league_id uuid)
returns table (id uuid, first_name text, last_name text, player_code integer)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name, profile.player_code
  from public.profiles profile
  where auth.uid() is not null
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
    and not exists (
      select 1
      from public.team_members membership
      join public.teams team on team.id = membership.team_id
      where membership.user_id = profile.id
        and team.league_id = target_league_id
    )
  order by profile.first_name, profile.last_name
  limit 5;
$$;

revoke all on function public.search_profiles_by_name(text, uuid) from public;
grant execute on function public.search_profiles_by_name(text, uuid) to authenticated;
