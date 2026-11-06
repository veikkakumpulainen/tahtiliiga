-- Tuloksen tarkistus palvelimella: tavallisessa kierroksessa kolme kelvollista
-- settiä, karsinnassa vain voittaja (tai 2-0 / 2-1 setein), ei tasapelejä.
-- Päättyneen kierroksen ottelua voi muuttaa vain ylläpito.
begin;
\ir helpers.psql
select plan(27);

create temp table teams as select gen_random_uuid() as home_id, gen_random_uuid() as away_id;
create function pg_temp.check_result(round_type text, home_score integer, away_score integer, set_scores text, walkover_home boolean default null)
returns text
language sql
as $$
  select public.match_result_error(round_type, home_score, away_score, set_scores::jsonb,
    case when walkover_home then home_id when not walkover_home then away_id end, home_id, away_id)
  from teams;
$$;

-- Yksittäinen setti
select ok(public.is_valid_padel_set('{"home":6,"away":4}'), '6-4 is a valid set');
select ok(public.is_valid_padel_set('{"home":5,"away":7}'), '5-7 is a valid set');
select ok(public.is_valid_padel_set('{"home":7,"away":6,"tiebreak":true,"homeTiebreak":"7","awayTiebreak":"5"}'), '7-6 with tiebreak 7-5 is a valid set');
select ok(public.is_valid_padel_set('{"home":6,"away":7,"tiebreak":true,"homeTiebreak":"10","awayTiebreak":"12"}'), 'a long tiebreak 10-12 is valid');
select ok(not public.is_valid_padel_set('{"home":6,"away":5}'), '6-5 is not a finished set');
select ok(not public.is_valid_padel_set('{"home":7,"away":6}'), '7-6 needs tiebreak points');
select ok(not public.is_valid_padel_set('{"home":7,"away":6,"tiebreak":true,"homeTiebreak":"7","awayTiebreak":"6"}'), 'a tiebreak needs a two point lead');
select ok(not public.is_valid_padel_set('{"home":7,"away":6,"tiebreak":true,"homeTiebreak":"5","awayTiebreak":"7"}'), 'the set winner must also win the tiebreak');
select ok(not public.is_valid_padel_set('{"home":8,"away":6}'), '8-6 is not a valid set');

-- Tavallinen kierros
select is(pg_temp.check_result('regular', 2, 1, '[{"home":6,"away":3},{"home":3,"away":6},{"home":6,"away":4}]'), null, 'regular 2-1 with three valid sets is accepted');
select is(pg_temp.check_result('regular', 3, 0, '[{"home":6,"away":3},{"home":6,"away":0},{"home":7,"away":5}]'), null, 'regular 3-0 is accepted');
select isnt(pg_temp.check_result('regular', 9, 0, '[]'), null, 'an impossible 9-0 without sets is rejected');
select isnt(pg_temp.check_result('regular', 1, 1, '[{"home":6,"away":3},{"home":3,"away":6}]'), null, 'a draw is rejected');
select isnt(pg_temp.check_result('regular', 2, 0, '[{"home":6,"away":3},{"home":6,"away":3}]'), null, 'a regular match needs all three sets');
select isnt(pg_temp.check_result('regular', 3, 0, '[{"home":6,"away":3},{"home":3,"away":6},{"home":6,"away":4}]'), null, 'the score must match the sets');
select isnt(pg_temp.check_result('regular', 2, 1, '[{"home":6,"away":5},{"home":3,"away":6},{"home":6,"away":4}]'), null, 'an invalid set is rejected');
select is(pg_temp.check_result('regular', 3, 0, '[{"home":6,"away":0},{"home":6,"away":0},{"home":6,"away":0}]', walkover_home => true), null, 'a walkover win 3-0 is accepted');
select isnt(pg_temp.check_result('regular', 3, 0, '[]', walkover_home => false), null, 'the walkover winner must be the team with the win');

-- Karsinta
select is(pg_temp.check_result('qualification', 0, 1, '[]'), null, 'qualification: winner only (1-0) is accepted');
select is(pg_temp.check_result('qualification', 1, 0, '[]', walkover_home => true), null, 'qualification: a walkover winner only is accepted');
select is(pg_temp.check_result('qualification', 2, 0, '[{"home":6,"away":3},{"home":6,"away":4}]'), null, 'qualification: 2-0 needs no third set');
select is(pg_temp.check_result('qualification', 1, 2, '[{"home":6,"away":3},{"home":4,"away":6},{"home":5,"away":7}]'), null, 'qualification: 2-1 with three sets is accepted');
select isnt(pg_temp.check_result('qualification', 2, 0, '[]'), null, 'qualification: without sets only the winner is recorded');
select isnt(pg_temp.check_result('qualification', 2, 1, '[{"home":6,"away":3},{"home":6,"away":4},{"home":4,"away":6}]'), null, 'qualification: no third set after 2-0');

-- Päättynyt kierros
create temp table ctx as select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid, add column round_id uuid, add column match_id uuid, add column captain uuid;
update ctx set league_id = tests.create_league(admin_id);
select tests.create_team_with_players(league_id, name, lower(name)) from ctx, unnest(array['Aa', 'Bb']) name;
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('Aa'), tests.team_id('Bb')]) from ctx;
update ctx set round_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31'), captain = (select captain_id from public.teams where name = 'Aa');
select tests.run_as(admin_id, format('select public.start_regular_round(%L)', round_id)) from ctx;
update ctx set match_id = tests.match_between(round_id, 'Aa', 'Bb');
select tests.record_result(round_id, 'Aa', 'Bb', 2, 1) from ctx;
select tests.run_as(admin_id, format('select public.complete_league_round(%L)', round_id)) from ctx;

create function pg_temp.save_three_nil(actor uuid)
returns text
language sql
as $$
  select tests.run_as(actor, format('select public.save_match_details(%L, null, null, 3, 0, %L::jsonb, null, %L, array[]::uuid[], array[]::uuid[], null, null)',
    match_id, '[{"home":6,"away":3},{"home":6,"away":0},{"home":7,"away":5}]', 'completed'))
  from ctx;
$$;
select isnt(pg_temp.save_three_nil(captain), null, 'a player cannot change a match after the round is completed') from ctx;
select is(pg_temp.save_three_nil(admin_id), null, 'an admin can still correct it') from ctx;
select is((select home_score from public.matches where id = (select match_id from ctx)), 3, 'the admin''s correction is saved');

select * from finish();
rollback;
