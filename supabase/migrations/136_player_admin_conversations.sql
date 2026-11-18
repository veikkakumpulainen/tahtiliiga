-- A league player can open a private conversation with the admins from the
-- chat tab's "Uusi keskustelu" button. It's an ordinary admin conversation
-- (132) whose members are the player and every admin, so any admin can
-- answer. Tapping the button again reopens the same conversation (and adds
-- admins who have joined since).

create or replace function public.start_conversation_with_admins()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id uuid;
begin
  if not exists (select 1 from public.team_members where user_id = auth.uid() and status = 'active') then
    raise exception 'Only league players can message the admins';
  end if;
  if not exists (select 1 from public.profiles where role = 'admin' and deleted_at is null and id <> auth.uid()) then
    raise exception 'No admins to message';
  end if;

  -- An existing conversation where everyone else is an admin.
  select conversation.id into conversation_id
  from public.admin_conversations conversation
  join public.admin_conversation_members own on own.conversation_id = conversation.id and own.user_id = auth.uid()
  where not exists (
    select 1 from public.admin_conversation_members member
    join public.profiles profile on profile.id = member.user_id
    where member.conversation_id = conversation.id and member.user_id <> auth.uid() and profile.role is distinct from 'admin'
  )
  order by conversation.created_at
  limit 1;

  if conversation_id is null then
    insert into public.admin_conversations (created_by) values (auth.uid()) returning id into conversation_id;
    insert into public.admin_conversation_members (conversation_id, user_id) values (conversation_id, auth.uid());
  end if;

  insert into public.admin_conversation_members (conversation_id, user_id)
  select conversation_id, profile.id from public.profiles profile
  where profile.role = 'admin' and profile.deleted_at is null
  on conflict do nothing;

  return conversation_id;
end;
$$;

revoke all on function public.start_conversation_with_admins() from public, anon;
grant execute on function public.start_conversation_with_admins() to authenticated;

-- The admins' list row named every other member, which for these
-- conversations would list the other admins too. Name the non-admins
-- instead, falling back to everyone when the others are all admins.
create or replace function public.get_my_admin_conversations()
returns table (id uuid, created_at timestamptz, other_names text, member_count integer)
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
    count(member.user_id)::integer
  from public.admin_conversations conversation
  join public.admin_conversation_members member on member.conversation_id = conversation.id
  join public.profiles profile on profile.id = member.user_id
  where public.is_admin_conversation_member(conversation.id)
  group by conversation.id, conversation.created_at;
$$;
