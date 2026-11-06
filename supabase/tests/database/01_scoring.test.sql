-- Pisteytys: setti 1, ottelun voitto 2, pelattu häviö 1, luovutushäviö 0,
-- lohkon voitto +2. Tasapisteissä keskinäinen ottelu ratkaisee.
begin;
\ir helpers.psql
select plan(14);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid, add column round_id uuid;
update ctx set league_id = tests.create_league(admin_id);

-- Team names are chosen so that alphabetical order would break the Zeta /
-- Beta tie the wrong way: only head-to-head puts Zeta ahead.
select tests.create_team_with_players(league_id, name, lower(name)) from ctx, unnest(array['Alfa', 'Zeta', 'Beta', 'Delta']) name;
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('Alfa'), tests.team_id('Zeta'), tests.team_id('Beta'), tests.team_id('Delta')]) from ctx;
update ctx set round_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31');

select is(tests.run_as(admin_id, format('select public.start_regular_round(%L)', round_id)), null, 'admin starts the regular round') from ctx;
select is((select count(*)::integer from public.matches where league_round_id = (select round_id from ctx)), 6, 'a group of four plays six matches');

select tests.record_result(round_id, 'Alfa', 'Zeta', 2, 1) from ctx;                    -- Alfa 4, Zeta 2
select tests.record_result(round_id, 'Alfa', 'Beta', 3, 0) from ctx;                    -- Alfa 5, Beta 1
select tests.record_result(round_id, 'Alfa', 'Delta', 3, 0, walkover => true) from ctx; -- Alfa 5, Delta 0
select tests.record_result(round_id, 'Zeta', 'Beta', 2, 1) from ctx;                    -- Zeta 4, Beta 2
select tests.record_result(round_id, 'Delta', 'Zeta', 2, 1) from ctx;                   -- Delta 4, Zeta 2
select tests.record_result(round_id, 'Beta', 'Delta', 3, 0) from ctx;                   -- Beta 5, Delta 1

create temp table ranking as select * from public.get_regular_round_group_rankings((select round_id from ctx));

select is((select points from ranking where team_name = 'Alfa'), 14::bigint, 'Alfa: 4 + 5 + walkover win 5 = 14');
select is((select points from ranking where team_name = 'Zeta'), 8::bigint, 'Zeta: 2 + 4 + played loss 2 = 8');
select is((select points from ranking where team_name = 'Beta'), 8::bigint, 'Beta: 1 + 2 + 5 = 8');
select is((select points from ranking where team_name = 'Delta'), 5::bigint, 'Delta: walkover loss 0 + 4 + 1 = 5');
select is((select wins from ranking where team_name = 'Alfa'), 3::bigint, 'a walkover win counts as a win');

select is((select rank_position from ranking where team_name = 'Alfa'), 1, 'most points ranks first');
select is((select rank_position from ranking where team_name = 'Zeta'), 2, 'tied on points: Zeta won the head-to-head against Beta');
select is((select rank_position from ranking where team_name = 'Beta'), 3, 'tied on points: Beta lost the head-to-head');
select is((select rank_position from ranking where team_name = 'Delta'), 4, 'fewest points ranks last');

select is(tests.run_as(admin_id, format('select public.complete_league_round(%L)', round_id)), null, 'admin completes the round') from ctx;
select is((select points from public.league_round_bonus_points where team_id = tests.team_id('Alfa')), 2, 'the group winner gets a 2 point bonus');
select is(
  (select (row ->> 'points')::integer from ctx, jsonb_array_elements(tests.query_as(admin_id, format('select * from public.get_league_total_standings(%L, %L)', league_id, 'avoin'))) row where row ->> 'team_name' = 'Alfa'),
  16, 'total standings include the group win bonus: 14 + 2');

select * from finish();
rollback;
