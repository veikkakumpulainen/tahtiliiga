-- Oikeudet: pelaaja näkee ja muuttaa vain omaa dataansa, ylläpidon toiminnot
-- vaativat ylläpitäjän ja kirjautumaton näkee vain julkisen.
begin;
\ir helpers.psql
select plan(28);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid, add column round_id uuid, add column home_captain uuid, add column away_captain uuid,
  add column other_captain uuid, add column outsider uuid, add column own_match uuid, add column other_match uuid,
  add column own_group uuid, add column other_group uuid;
update ctx set league_id = tests.create_league(admin_id), outsider = tests.create_user('outsider@test.fi', 'Ulko', 'Puolinen');

select tests.create_team_with_players(league_id, name, replace(lower(name), ' ', '')) from ctx,
  unnest(array['Koti', 'Vieras', 'Kolmas', 'Neljas', 'Muu A', 'Muu B']) name;
update ctx set
  own_group = tests.create_group(league_id, 'Lohko 1', array[tests.team_id('Koti'), tests.team_id('Vieras'), tests.team_id('Kolmas'), tests.team_id('Neljas')]),
  other_group = tests.create_group(league_id, 'Lohko 2', array[tests.team_id('Muu A'), tests.team_id('Muu B')]),
  round_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31');
update ctx set
  home_captain = (select captain_id from public.teams where name = 'Koti'),
  away_captain = (select captain_id from public.teams where name = 'Vieras'),
  other_captain = (select captain_id from public.teams where name = 'Muu A');
select tests.run_as(admin_id, format('select public.start_regular_round(%L)', round_id)) from ctx;
update ctx set own_match = tests.match_between(round_id, 'Koti', 'Vieras'), other_match = tests.match_between(round_id, 'Muu A', 'Muu B');

insert into public.group_messages (group_id, user_id, message) select own_group, home_captain, 'Lohko 1:n viesti' from ctx;
insert into public.group_messages (group_id, user_id, message) select other_group, other_captain, 'Lohko 2:n viesti' from ctx;

-- Ylläpidon toiminnot
select isnt(tests.run_as(home_captain, format('select public.complete_league_round(%L)', round_id)), null, 'player cannot complete a round') from ctx;
select isnt(tests.run_as(home_captain, format('select public.admin_auto_assign_groups(%L)', league_id)), null, 'player cannot run the group allocation') from ctx;
select isnt(tests.run_as(home_captain, format('select public.admin_delete_team(%L)', tests.team_id('Vieras'))), null, 'player cannot delete a team') from ctx;
select isnt(tests.run_as(home_captain, format('select public.delete_league_with_data(%L)', league_id)), null, 'player cannot delete a league') from ctx;
select isnt(tests.run_as(home_captain, format('select public.lock_league_registration(%L)', league_id)), null, 'player cannot lock registration') from ctx;
select isnt(tests.run_as(home_captain, format('select public.admin_update_team_roster(%L, %L, %L, null)', tests.team_id('Vieras'), away_captain, outsider)), null, 'player cannot change another team''s roster') from ctx;
select isnt(tests.run_as(home_captain, format('insert into public.leagues (name, start_date, end_date, status, created_by, city_id) select %L, %L, %L, %L, %L, city_id from public.leagues limit 1', 'Oma liiga', '2026-01-01', '2026-12-31', 'ongoing', home_captain)), null, 'player cannot create a league') from ctx;
select isnt(tests.run_as(home_captain, format('insert into public.community_messages (league_id, user_id, message) values (%L, %L, %L)', league_id, home_captain, 'Tiedote')), null, 'player cannot post to Tiedotteet') from ctx;

-- Oma profiili ja ylläpitäjyys
select tests.run_as(home_captain, format('update public.profiles set role = %L where id = %L', 'admin', home_captain)) from ctx;
select is((select role from public.profiles where id = (select home_captain from ctx)), 'user', 'player cannot make themselves an admin');
select is(tests.count_as(home_captain, 'select id from public.profiles'), 1, 'player sees only their own profile') from ctx;
select is(tests.count_as(null, 'select id from public.profiles'), 0, 'anonymous user sees no profiles');

-- Ottelut
select isnt(tests.run_as(outsider, format('select public.save_match_details(%L, null, null, 2, 0, %L::jsonb, null, %L, array[]::uuid[], array[]::uuid[], null, null)', own_match, '[]', 'completed')), null, 'outsider cannot record a result') from ctx;
select isnt(tests.run_as(home_captain, format('select public.save_match_details(%L, null, null, 2, 0, %L::jsonb, null, %L, array[]::uuid[], array[]::uuid[], null, null)', other_match, '[]', 'completed')), null, 'player cannot record a result in another group''s match') from ctx;
select isnt(tests.run_as(home_captain, format('select public.save_match_details(%L, null, null, null, null, %L::jsonb, null, %L, array[]::uuid[], array[]::uuid[], null, null)', own_match, '[]', 'double_walkover')), null, 'player cannot mark a match unplayed by both teams') from ctx;
select tests.run_as(home_captain, format('update public.matches set home_score = 3, away_score = 0, status = %L where id = %L', 'completed', own_match)) from ctx;
select is((select status from public.matches where id = (select own_match from ctx)), 'scheduled', 'player cannot bypass save_match_details with a direct update');
select tests.run_as(home_captain, format('update public.matches set home_team_id = %L, away_team_id = %L where id = %L', tests.team_id('Koti'), tests.team_id('Muu A'), own_match)) from ctx;
select is(tests.match_between(round_id, 'Koti', 'Vieras'), own_match, 'player cannot change who plays the match') from ctx;
select tests.run_as(home_captain, format('insert into public.league_round_bonus_points (league_round_id, team_id, points) values (%L, %L, 10)', round_id, tests.team_id('Koti'))) from ctx;
select is((select count(*)::integer from public.league_round_bonus_points), 0, 'player cannot give their team bonus points');
select is(tests.run_as(home_captain, format('select public.save_match_details(%L, %L, %L, 2, 1, %L::jsonb, null, %L, array[]::uuid[], array[]::uuid[], null, null)', own_match, '2026-01-10 18:00+02', 'Testihalli', '[{"home":6,"away":3},{"home":3,"away":6},{"home":6,"away":4}]', 'completed')), null, 'a team member records their own match') from ctx;

-- Maksut
insert into public.payments (team_id, user_id, amount, payment_status, payment_method) select tests.team_id('Koti'), home_captain, 30, 'pending', 'split' from ctx;
select tests.run_as(home_captain, format('update public.payments set payment_status = %L, paid_at = now() where user_id = %L', 'paid', home_captain)) from ctx;
select is((select payment_status from public.payments where user_id = (select home_captain from ctx)), 'pending', 'player cannot mark their own payment paid');
select isnt(tests.run_as(home_captain, format('insert into public.payments (team_id, user_id, amount, payment_status) values (%L, %L, 30, %L)', tests.team_id('Koti'), home_captain, 'paid')), null, 'player cannot insert a paid payment') from ctx;
select is(tests.count_as(other_captain, 'select id from public.payments'), 0, 'player cannot see another team''s payments') from ctx;

-- Joukkueet ja jäsenet
select tests.run_as(home_captain, format('insert into public.team_members (team_id, user_id, status) values (%L, %L, %L)', tests.team_id('Vieras'), outsider, 'active')) from ctx;
select is((select count(*)::integer from public.team_members where user_id = (select outsider from ctx)), 0, 'player cannot add people to another team');
select tests.run_as(home_captain, format('update public.teams set name = %L where id = %L', 'Kaapattu', tests.team_id('Vieras'))) from ctx;
select ok(tests.team_id('Vieras') is not null, 'player cannot rename another team');

-- Lohkochat
select is(tests.count_as(home_captain, format('select * from public.get_group_messages(%L)', own_group)), 1, 'player reads their own lohko chat') from ctx;
select is(tests.count_as(home_captain, format('select * from public.get_group_messages(%L)', other_group)), 0, 'player cannot read another lohko''s chat through the RPC') from ctx;
select is(tests.count_as(home_captain, format('select id from public.group_messages where group_id = %L', other_group)), 0, 'player cannot read another lohko''s chat directly') from ctx;
select isnt(tests.run_as(home_captain, format('insert into public.group_messages (group_id, user_id, message) values (%L, %L, %L)', other_group, home_captain, 'Hei')), null, 'player cannot post to another lohko''s chat') from ctx;
select isnt(tests.run_as(home_captain, format('insert into public.group_messages (group_id, user_id, message) values (%L, %L, %L)', own_group, away_captain, 'Toisen nimissa')), null, 'player cannot post in someone else''s name') from ctx;

select * from finish();
rollback;
