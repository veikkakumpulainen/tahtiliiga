-- Chattien näkyvyys: kapteenien yksityiskeskustelut ja ylläpidon keskustelut
-- näkyvät vain osallistujille.
begin;
\ir helpers.psql
select plan(16);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid, add column round_id uuid, add column captain_a uuid, add column member_a uuid,
  add column captain_b uuid, add column captain_c uuid, add column outsider uuid, add column direct_id uuid, add column admin_chat_id uuid;
update ctx set league_id = tests.create_league(admin_id), outsider = tests.create_user('outsider@test.fi', 'Ulko', 'Puolinen');
select tests.create_team_with_players(league_id, name, lower(name)) from ctx, unnest(array['Aa', 'Bb', 'Cc']) name;
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('Aa'), tests.team_id('Bb')]) from ctx;
select tests.create_group(league_id, 'Lohko 2', array[tests.team_id('Cc')]) from ctx;
update ctx set round_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31'),
  captain_a = (select captain_id from public.teams where name = 'Aa'),
  member_a = (select user_id from public.team_members where team_id = tests.team_id('Aa') and not is_captain),
  captain_b = (select captain_id from public.teams where name = 'Bb'),
  captain_c = (select captain_id from public.teams where name = 'Cc');
select tests.run_as(admin_id, format('select public.start_regular_round(%L)', round_id)) from ctx;

-- Kapteenien yksityiskeskustelu
select isnt(tests.run_as(member_a, format('select public.start_direct_conversation(%L, %L)', tests.team_id('Aa'), tests.team_id('Bb'))), null, 'only the captain can start a private conversation') from ctx;
select isnt(tests.run_as(captain_a, format('select public.start_direct_conversation(%L, %L)', tests.team_id('Aa'), tests.team_id('Cc'))), null, 'a private conversation needs both teams in the same lohko') from ctx;
update ctx set direct_id = (tests.query_as(captain_a, format('select public.start_direct_conversation(%L, %L) as id', tests.team_id('Aa'), tests.team_id('Bb'))) -> 0 ->> 'id')::uuid;
select isnt((select direct_id from ctx), null, 'the captain starts a conversation with another captain in the lohko');
select is(tests.run_as(captain_b, format('insert into public.direct_messages (conversation_id, user_id, message) values (%L, %L, %L)', direct_id, captain_b, 'Hei')), null, 'the other captain can reply') from ctx;
select is(tests.count_as(member_a, format('select * from public.get_direct_messages(%L)', direct_id)), 0, 'team members don''t see it before the teams are added') from ctx;
select is(tests.count_as(captain_c, format('select * from public.get_direct_messages(%L)', direct_id)), 0, 'a captain from another lohko cannot read it') from ctx;
select tests.run_as(captain_a, format('select public.include_teams_in_direct_conversation(%L)', direct_id)) from ctx;
select is(tests.count_as(member_a, format('select * from public.get_direct_messages(%L)', direct_id)), 1, 'after adding the teams their members see the history') from ctx;

-- Ylläpidon keskustelut
select isnt(tests.run_as(captain_a, format('select public.start_admin_conversation(array[%L]::uuid[])', outsider)), null, 'a player cannot start an admin conversation') from ctx;
update ctx set admin_chat_id = (tests.query_as(admin_id, format('select public.start_admin_conversation(array[%L]::uuid[]) as id', captain_a)) -> 0 ->> 'id')::uuid;
select isnt((select admin_chat_id from ctx), null, 'the admin starts a conversation with a player');
select is((tests.query_as(admin_id, format('select public.start_admin_conversation(array[%L]::uuid[]) as id', captain_a)) -> 0 ->> 'id')::uuid, admin_chat_id, 'starting again with the same person reopens the same conversation') from ctx;
select is(tests.run_as(captain_a, format('insert into public.admin_messages (conversation_id, user_id, message) values (%L, %L, %L)', admin_chat_id, captain_a, 'Kiitos')), null, 'the player can reply') from ctx;
select is(tests.count_as(captain_b, format('select * from public.get_admin_messages(%L)', admin_chat_id)), 0, 'someone outside the conversation cannot read it') from ctx;
select isnt(tests.run_as(captain_b, format('insert into public.admin_messages (conversation_id, user_id, message) values (%L, %L, %L)', admin_chat_id, captain_b, 'Hei')), null, 'someone outside the conversation cannot post') from ctx;
select isnt(tests.run_as(captain_a, format('select public.add_admin_conversation_members(%L, array[%L]::uuid[])', admin_chat_id, captain_b)), null, 'a player cannot add people') from ctx;
select is(tests.run_as(admin_id, format('select public.add_admin_conversation_members(%L, array[%L]::uuid[])', admin_chat_id, captain_b)), null, 'the admin adds another person') from ctx;
select is(tests.count_as(captain_b, format('select * from public.get_admin_messages(%L)', admin_chat_id)), 1, 'the added person sees the earlier messages') from ctx;

select * from finish();
rollback;
