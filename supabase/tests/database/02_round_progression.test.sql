-- Kierroksen päättyessä lohkon voittaja nousee ylempään lohkoon ja viimeinen
-- putoaa alempaan. Karsinnassa pelaa ylemmän lohkon 3. ja alemman lohkon 2.;
-- jos alempi voittaa, joukkueet vaihtavat lohkoa. Karsintavoitosta 1 piste.
begin;
\ir helpers.psql
select plan(21);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id,
       tests.create_user('outsider@test.fi', 'Ulko', 'Puolinen') as outsider_id;
alter table ctx add column league_id uuid, add column regular_id uuid, add column qualification_id uuid, add column second_regular_id uuid;
update ctx set league_id = tests.create_league(admin_id);

-- In each group the team whose name sorts first wins every match (see
-- tests.play_round_in_name_order), so A is 1st, B 2nd, C 3rd and D last.
select tests.create_team_with_players(league_id, name, replace(lower(name), ' ', '')) from ctx,
  unnest(array['L1 A', 'L1 B', 'L1 C', 'L1 D', 'L2 A', 'L2 B', 'L2 C', 'L2 D']) name;
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('L1 A'), tests.team_id('L1 B'), tests.team_id('L1 C'), tests.team_id('L1 D')]) from ctx;
select tests.create_group(league_id, 'Lohko 2', array[tests.team_id('L2 A'), tests.team_id('L2 B'), tests.team_id('L2 C'), tests.team_id('L2 D')]) from ctx;
update ctx set
  regular_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31'),
  qualification_id = tests.create_round(league_id, 'Karsinta 1', 'qualification', '2026-02-01', '2026-02-07'),
  second_regular_id = tests.create_round(league_id, 'Kierros 2', 'regular', '2026-02-08', '2026-03-08');

create temp table lohko as select id, name from public.groups where league_id = (select league_id from ctx);

-- Order and permissions
select isnt(tests.run_as(admin_id, format('select public.start_qualification_round(%L)', qualification_id)), null, 'qualification cannot start before a regular round is completed') from ctx;
select isnt(tests.run_as(outsider_id, format('select public.start_regular_round(%L)', regular_id)), null, 'a player cannot start a round') from ctx;
select is(tests.run_as(admin_id, format('select public.start_regular_round(%L)', regular_id)), null, 'admin starts the regular round') from ctx;
select isnt(tests.run_as(admin_id, format('select public.complete_league_round(%L)', regular_id)), null, 'the round cannot be completed while matches are unplayed') from ctx;

select tests.play_round_in_name_order(regular_id) from ctx;
select isnt(tests.run_as(outsider_id, format('select public.complete_league_round(%L)', regular_id)), null, 'a player cannot complete a round') from ctx;
select is(tests.run_as(admin_id, format('select public.complete_league_round(%L)', regular_id)), null, 'admin completes the regular round') from ctx;

-- Promotion and relegation
select is(tests.group_id('L2 A'), (select id from lohko where name = 'Lohko 1'), 'the winner of Lohko 2 is promoted to Lohko 1');
select is(tests.group_id('L1 D'), (select id from lohko where name = 'Lohko 2'), 'the last of Lohko 1 is relegated to Lohko 2');
select is(tests.group_id('L1 A'), (select id from lohko where name = 'Lohko 1'), 'the winner of the top group stays');
select is(tests.group_id('L2 D'), (select id from lohko where name = 'Lohko 2'), 'the last of the bottom group stays');
select is(tests.group_id('L1 C'), (select id from lohko where name = 'Lohko 1'), 'the middle teams stay before qualification');
select is((select count(*)::integer from public.league_round_bonus_points where league_round_id = (select regular_id from ctx)), 2, 'both group winners get the bonus');

-- Qualification: 3rd of the upper group vs 2nd of the lower group
select is(tests.run_as(admin_id, format('select public.start_qualification_round(%L)', qualification_id)), null, 'admin starts the qualification round') from ctx;
select is((select count(*)::integer from public.matches where league_round_id = (select qualification_id from ctx)), 1, 'two groups produce one qualification match');
select ok(tests.match_between(qualification_id, 'L1 C', 'L2 B') is not null, 'the qualification pits Lohko 1''s 3rd (L1 C) against Lohko 2''s 2nd (L2 B)') from ctx;

-- The lower group's team wins: they swap groups.
select tests.record_result(qualification_id, 'L2 B', 'L1 C', 2, 0) from ctx;
select is(tests.run_as(admin_id, format('select public.complete_league_round(%L)', qualification_id)), null, 'admin completes the qualification round') from ctx;
select is(tests.group_id('L2 B'), (select id from lohko where name = 'Lohko 1'), 'the qualification winner from the lower group moves up');
select is(tests.group_id('L1 C'), (select id from lohko where name = 'Lohko 2'), 'the qualification loser from the upper group moves down');

-- Total standings: L2 B won two 2-1 matches and lost one (4 + 4 + 2 = 10),
-- plus 1 point for the qualification win.
select is(
  (select (row ->> 'points')::integer from ctx, jsonb_array_elements(tests.query_as(admin_id, format('select * from public.get_league_total_standings(%L, %L)', league_id, 'avoin'))) row where row ->> 'team_name' = 'L2 B'),
  11, 'a qualification win adds exactly 1 point to the total standings');

-- The next regular round is played in the new groups.
select is(tests.run_as(admin_id, format('select public.start_regular_round(%L)', second_regular_id)), null, 'admin starts the next regular round') from ctx;
select ok(tests.match_between(second_regular_id, 'L2 B', 'L1 A') is not null and tests.match_between(second_regular_id, 'L1 C', 'L2 C') is not null, 'the next round''s matches follow the new groups') from ctx;

select * from finish();
rollback;
