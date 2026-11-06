-- Lohkosäännöt: lohkoissa on 4 joukkuetta, vain alin lohko voi olla 3
-- joukkueen lohko. Ylemmän lohkon 4. putoaa ja alemman 1. nousee, alemman 2.
-- karsii ylemmän 3:tta vastaan, ja kolmen joukkueen lohkon 3. pysyy.
-- Tasapisteissä enemmän otteluita pelannut sijoittuu ylemmäs.
begin;
\ir helpers.psql
select plan(19);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid, add column regular_id uuid, add column qualification_id uuid;
update ctx set league_id = tests.create_league(admin_id);

-- Kolme lohkoa: 4, 4 ja 3 joukkuetta. Nimijärjestys = sijoitus lohkossa.
select tests.create_team_with_players(league_id, name, replace(lower(name), ' ', '')) from ctx,
  unnest(array['L1 A', 'L1 B', 'L1 C', 'L1 D', 'L2 A', 'L2 B', 'L2 C', 'L2 D', 'L3 A', 'L3 B', 'L3 C']) name;
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('L1 A'), tests.team_id('L1 B'), tests.team_id('L1 C'), tests.team_id('L1 D')]) from ctx;
select tests.create_group(league_id, 'Lohko 2', array[tests.team_id('L2 A'), tests.team_id('L2 B'), tests.team_id('L2 C'), tests.team_id('L2 D')]) from ctx;
select tests.create_group(league_id, 'Lohko 3', array[tests.team_id('L3 A'), tests.team_id('L3 B'), tests.team_id('L3 C')]) from ctx;
update ctx set
  regular_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31'),
  qualification_id = tests.create_round(league_id, 'Karsinta 1', 'qualification', '2026-02-01', '2026-02-07');
create temp table lohko as select id, name from public.groups where league_id = (select league_id from ctx);

select tests.run_as(admin_id, format('select public.start_regular_round(%L)', regular_id)) from ctx;
select is((select count(*)::integer from public.matches where league_round_id = (select regular_id from ctx)), 15, 'two groups of four and one of three play 6 + 6 + 3 matches');
select tests.play_round_in_name_order(regular_id) from ctx;
select is(tests.run_as(admin_id, format('select public.complete_league_round(%L)', regular_id)), null, 'admin completes the round') from ctx;

select is(tests.group_id('L2 A'), (select id from lohko where name = 'Lohko 1'), 'Lohko 2 winner moves up to Lohko 1');
select is(tests.group_id('L1 D'), (select id from lohko where name = 'Lohko 2'), 'Lohko 1 4th moves down to Lohko 2');
select is(tests.group_id('L3 A'), (select id from lohko where name = 'Lohko 2'), 'the three-team bottom group''s winner moves up to Lohko 2');
select is(tests.group_id('L2 D'), (select id from lohko where name = 'Lohko 3'), 'Lohko 2 4th moves down to the bottom group');
select is(tests.group_id('L3 C'), (select id from lohko where name = 'Lohko 3'), 'the three-team bottom group''s 3rd stays');
select is((select count(*)::integer from public.group_teams where group_id = (select id from lohko where name = 'Lohko 3')), 3, 'the bottom group still has three teams');

select is(tests.run_as(admin_id, format('select public.start_qualification_round(%L)', qualification_id)), null, 'admin starts the qualification') from ctx;
select is((select count(*)::integer from public.matches where league_round_id = (select qualification_id from ctx)), 2, 'every group boundary has one qualification match');
select ok(tests.match_between(qualification_id, 'L1 C', 'L2 B') is not null, 'Lohko 1''s 3rd plays Lohko 2''s 2nd') from ctx;
select ok(tests.match_between(qualification_id, 'L2 C', 'L3 B') is not null, 'Lohko 2''s 3rd plays the three-team group''s 2nd') from ctx;

-- The upper team wins one, the lower team the other.
select tests.record_result(qualification_id, 'L1 C', 'L2 B', 1, 0) from ctx;
select tests.record_result(qualification_id, 'L3 B', 'L2 C', 1, 0) from ctx;
select is(tests.run_as(admin_id, format('select public.complete_league_round(%L)', qualification_id)), null, 'admin completes the qualification') from ctx;
select is(tests.group_id('L1 C'), (select id from lohko where name = 'Lohko 1'), 'when the upper team wins, both stay');
select is(tests.group_id('L3 B'), (select id from lohko where name = 'Lohko 2'), 'when the lower team wins, it moves up');
select is(tests.group_id('L2 C'), (select id from lohko where name = 'Lohko 3'), '... and the loser moves down');

-- Tasapisteet: enemmän pelannut ylemmäs, vaikka hävisi keskinäisen.
-- X: 0-3 Y (1), 3-0 P (5), 2-1 Q (4) = 10 in 3 matches.
-- Y: 3-0 X (5), 3-0 P (5), Q unplayed = 10 in 2 matches.
select tests.create_team_with_players(league_id, name, lower(name)) from ctx, unnest(array['X', 'Y', 'P', 'Q']) name;
select tests.create_group(league_id, 'Lohko 9', array[tests.team_id('X'), tests.team_id('Y'), tests.team_id('P'), tests.team_id('Q')]) from ctx;
create temp table tie_round as select id from public.league_rounds where false;
update public.league_rounds set status = 'completed' where league_id = (select league_id from ctx);
insert into tie_round select tests.create_round(league_id, 'Kierros 2', 'regular', '2026-03-01', '2026-03-31') from ctx;
select tests.run_as(admin_id, format('select public.start_regular_round(%L)', id)) from ctx, tie_round;
select tests.record_result(id, 'Y', 'X', 3, 0) from tie_round;
select tests.record_result(id, 'X', 'P', 3, 0) from tie_round;
select tests.record_result(id, 'X', 'Q', 2, 1) from tie_round;
select tests.record_result(id, 'Y', 'P', 3, 0) from tie_round;
select tests.record_result(id, 'P', 'Q', 2, 1) from tie_round;
update public.matches set status = 'double_walkover' where id = (select tests.match_between(id, 'Y', 'Q') from tie_round);
create temp table tie_ranking as select * from public.get_regular_round_group_rankings((select id from tie_round));
select is((select array[points, played] from tie_ranking where team_name = 'X'), array[10::bigint, 3::bigint], 'X: 10 points from 3 matches');
select is((select array[points, played] from tie_ranking where team_name = 'Y'), array[10::bigint, 2::bigint], 'Y: 10 points from 2 matches');
select ok((select rank_position from tie_ranking where team_name = 'X') < (select rank_position from tie_ranking where team_name = 'Y'), 'tied on points, the team with more matches played ranks higher even though it lost the head-to-head');

select * from finish();
rollback;
