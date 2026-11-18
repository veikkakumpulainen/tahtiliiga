-- Every league player gets a private conversation with the admins, like the
-- league's Tiedotteet: it's created when they become an active team member
-- (register a team or accept an invitation). It's an ordinary admin
-- conversation (132) whose members are the player and every admin, so any
-- admin can answer; the player only ever sees "Ylläpito". player_id marks
-- these conversations, one per player.

alter table public.admin_conversations add column if not exists player_id uuid unique references public.profiles(id) on delete cascade;

-- Creates the player's conversation with every admin in it, unless they
-- already have one. Admins don't get one. Not callable by clients.
create or replace function public.ensure_player_admin_conversation(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_conversation_id uuid;
begin
  if not exists (select 1 from public.profiles where id = target_user_id and role is distinct from 'admin' and deleted_at is null) then
    return;
  end if;

  insert into public.admin_conversations (player_id) values (target_user_id)
  on conflict (player_id) do nothing
  returning id into new_conversation_id;
  if new_conversation_id is null then return; end if;

  insert into public.admin_conversation_members (conversation_id, user_id)
  select new_conversation_id, profile.id from public.profiles profile
  where profile.id = target_user_id or (profile.role = 'admin' and profile.deleted_at is null)
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_player_admin_conversation(uuid) from public, anon, authenticated;

create or replace function public.create_player_admin_conversation_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_player_admin_conversation(new.user_id);
  return new;
end;
$$;

revoke all on function public.create_player_admin_conversation_on_membership() from public, anon, authenticated;

drop trigger if exists create_player_admin_conversation_on_membership on public.team_members;
create trigger create_player_admin_conversation_on_membership
after insert or update of status on public.team_members
for each row when (new.status = 'active')
execute function public.create_player_admin_conversation_on_membership();

-- A new admin joins every player's conversation (and sees its history).
create or replace function public.add_admin_to_player_conversations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_conversation_members (conversation_id, user_id)
  select conversation.id, new.id from public.admin_conversations conversation
  where conversation.player_id is not null
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.add_admin_to_player_conversations() from public, anon, authenticated;

drop trigger if exists add_admin_to_player_conversations on public.profiles;
create trigger add_admin_to_player_conversations
after insert or update of role on public.profiles
for each row when (new.role = 'admin')
execute function public.add_admin_to_player_conversations();

-- Everyone already playing gets theirs now.
select public.ensure_player_admin_conversation(member.user_id)
from (select distinct user_id from public.team_members where status = 'active') member;

-- An admin starting a conversation with a single player opens that player's
-- own conversation, so the player doesn't get a second "Ylläpito" row.
create or replace function public.start_admin_conversation(member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  others uuid[];
  conversation_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can start these conversations'; end if;
  select coalesce(array_agg(distinct member_id), array[]::uuid[]) into others
  from unnest(member_ids) member_id
  where member_id <> auth.uid() and exists (select 1 from public.profiles where id = member_id and deleted_at is null);
  if cardinality(others) = 0 then raise exception 'Choose at least one person'; end if;

  if cardinality(others) = 1 then
    select conversation.id into conversation_id from public.admin_conversations conversation where conversation.player_id = others[1];
    if conversation_id is not null then
      insert into public.admin_conversation_members (conversation_id, user_id) values (conversation_id, auth.uid()) on conflict do nothing;
      return conversation_id;
    end if;

    select conversation.id into conversation_id
    from public.admin_conversations conversation
    where (select array_agg(member.user_id order by member.user_id) from public.admin_conversation_members member where member.conversation_id = conversation.id)
      = (select array_agg(person order by person) from unnest(array[auth.uid(), others[1]]) person)
    order by conversation.created_at
    limit 1;
    if conversation_id is not null then return conversation_id; end if;
  end if;

  insert into public.admin_conversations (created_by) values (auth.uid()) returning id into conversation_id;
  insert into public.admin_conversation_members (conversation_id, user_id)
  select conversation_id, person from unnest(array_append(others, auth.uid())) person;
  return conversation_id;
end;
$$;

-- The chat list's rows. player_id is new, so the function is recreated.
-- other_names now names the non-admins (the player, for an admin), falling
-- back to everyone when the others are all admins.
drop function if exists public.get_my_admin_conversations();
create function public.get_my_admin_conversations()
returns table (id uuid, created_at timestamptz, other_names text, member_count integer, player_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select conversation.id, conversation.created_at,
    coalesce(
      string_agg(concat_ws(' ', profile.first_name, profile.last_name), ', ' order by profile.first_name, profile.last_name) filter (where member.user_id <> auth.uid() and profile.role is distinct from 'admin'),
      string_agg(concat_ws(' ', profile.first_name, profile.last_name), ', ' order by profile.first_name, profile.last_name) filter (where member.user_id <> auth.uid()),
      ''),
    count(member.user_id)::integer,
    conversation.player_id
  from public.admin_conversations conversation
  join public.admin_conversation_members member on member.conversation_id = conversation.id
  join public.profiles profile on profile.id = member.user_id
  where public.is_admin_conversation_member(conversation.id)
  group by conversation.id, conversation.created_at, conversation.player_id;
$$;

revoke all on function public.get_my_admin_conversations() from public, anon;
grant execute on function public.get_my_admin_conversations() to authenticated;
