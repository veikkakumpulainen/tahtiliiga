-- Undoes 136: players don't get their own conversation with the admins and
-- can't start one. Admins still start conversations (132), and players can
-- reply in them. Written to work whichever draft of 136 was applied (the
-- first one only added start_conversation_with_admins()).

drop function if exists public.start_conversation_with_admins();

drop trigger if exists create_player_admin_conversation_on_membership on public.team_members;
drop function if exists public.create_player_admin_conversation_on_membership();
drop trigger if exists add_admin_to_player_conversations on public.profiles;
drop function if exists public.add_admin_to_player_conversations();
drop function if exists public.ensure_player_admin_conversation(uuid);

-- The players' conversations go, unless someone has written in one; those
-- stay as ordinary admin conversations.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'admin_conversations' and column_name = 'player_id') then
    delete from public.admin_conversations conversation
    where conversation.player_id is not null
      and not exists (select 1 from public.admin_messages message where message.conversation_id = conversation.id);
  end if;
end;
$$;

alter table public.admin_conversations drop column if exists player_id;

-- start_admin_conversation() and get_my_admin_conversations() as in 132.
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

revoke all on function public.start_admin_conversation(uuid[]) from public, anon;
grant execute on function public.start_admin_conversation(uuid[]) to authenticated;

drop function if exists public.get_my_admin_conversations();
create function public.get_my_admin_conversations()
returns table (id uuid, created_at timestamptz, other_names text, member_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select conversation.id, conversation.created_at,
    coalesce(string_agg(concat_ws(' ', profile.first_name, profile.last_name), ', ' order by profile.first_name, profile.last_name) filter (where member.user_id <> auth.uid()), ''),
    count(member.user_id)::integer
  from public.admin_conversations conversation
  join public.admin_conversation_members member on member.conversation_id = conversation.id
  join public.profiles profile on profile.id = member.user_id
  where public.is_admin_conversation_member(conversation.id)
  group by conversation.id, conversation.created_at;
$$;

revoke all on function public.get_my_admin_conversations() from public, anon;
grant execute on function public.get_my_admin_conversations() to authenticated;
