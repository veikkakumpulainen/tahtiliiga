-- Ottelun säännöt: yli kaksihenkinen joukkue valitsee pelaavan parin,
-- varapelaajan hyväksyy vastustaja ennen tulosta, Mixtyssä pari on mies ja nainen.
begin;
\ir helpers.psql
select plan(12);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid, add column round_id uuid, add column mixty_round_id uuid,
  add column trio_1 uuid, add column trio_2 uuid, add column trio_3 uuid, add column duo_captain uuid, add column substitute uuid,
  add column mixty_man uuid, add column mixty_man_2 uuid, add column mixty_woman uuid, add column mixty_opponent uuid,
  add column trio_match uuid, add column mixty_match uuid;
update ctx set league_id = tests.create_league(admin_id),
  trio_1 = tests.create_user('trio1@test.fi', 'Trio', 'Yksi'),
  trio_2 = tests.create_user('trio2@test.fi', 'Trio', 'Kaksi'),
  trio_3 = tests.create_user('trio3@test.fi', 'Trio', 'Kolme'),
  substitute = tests.create_user('vara@test.fi', 'Vara', 'Pelaaja'),
  mixty_man = tests.create_user('mies@test.fi', 'Mies', 'Yksi', 'male'),
  mixty_man_2 = tests.create_user('mies2@test.fi', 'Mies', 'Kaksi', 'male'),
  mixty_woman = tests.create_user('nainen@test.fi', 'Nainen', 'Yksi', 'female');

select tests.create_team(league_id, 'Trio', array[trio_1, trio_2, trio_3]) from ctx;
select tests.create_team_with_players(league_id, 'Duo', 'duo') from ctx;
update ctx set duo_captain = (select captain_id from public.teams where name = 'Duo');
select tests.create_team(league_id, 'Mixty 1', array[mixty_man, mixty_man_2, mixty_woman], 'mixty') from ctx;
select tests.create_team_with_players(league_id, 'Mixty 2', 'mixty2', 'mixty') from ctx;
update ctx set mixty_opponent = (select captain_id from public.teams where name = 'Mixty 2');
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('Trio'), tests.team_id('Duo')]) from ctx;
select tests.create_group(league_id, 'Lohko 1', array[tests.team_id('Mixty 1'), tests.team_id('Mixty 2')], 'mixty') from ctx;
update ctx set round_id = tests.create_round(league_id, 'Kierros 1', 'regular', '2026-01-01', '2026-01-31');
select tests.run_as(admin_id, format('select public.start_regular_round(%L)', round_id)) from ctx;
update ctx set trio_match = tests.match_between(round_id, 'Trio', 'Duo'), mixty_match = tests.match_between(round_id, 'Mixty 1', 'Mixty 2');

-- Saves a 2-1 result for the trio match as `actor`, with the trio's lineup
-- and optional substitute.
create function pg_temp.save_trio_result(actor uuid, lineup uuid[], substitute_id uuid default null)
returns text
language sql
as $$
  select tests.run_as(actor, format(
    'select public.save_match_details(%L, null, null, %s, %s, %L::jsonb, null, %L, %L::uuid[], %L::uuid[], %L, %L)',
    ctx.trio_match,
    case when trio_home then 2 else 1 end, case when trio_home then 1 else 2 end,
    '[{"home":6,"away":3},{"home":3,"away":6},{"home":6,"away":4}]', 'completed',
    case when trio_home then lineup else array[]::uuid[] end, case when trio_home then array[]::uuid[] else lineup end,
    case when trio_home then substitute_id end, case when trio_home then null else substitute_id end))
  from ctx, lateral (select home_team_id = tests.team_id('Trio') as trio_home from public.matches where id = ctx.trio_match) side;
$$;

-- Kokoonpano
select isnt(pg_temp.save_trio_result(trio_1, array[]::uuid[]), null, 'a team of three must choose its playing pair before the result') from ctx;
select isnt(pg_temp.save_trio_result(trio_1, array[trio_1, trio_1]), null, 'the same player cannot fill both spots') from ctx;
select isnt(pg_temp.save_trio_result(trio_1, array[trio_1, duo_captain]), null, 'the pair must belong to the team') from ctx;

-- Varapelaaja
select isnt(pg_temp.save_trio_result(trio_1, array[trio_1, substitute], substitute), null, 'a substitute without the opponent''s approval blocks the result') from ctx;
select is(tests.run_as(trio_1, format('select public.save_match_details(%L, null, null, null, null, %L::jsonb, null, %L, %L::uuid[], %L::uuid[], %L, %L)',
  trio_match, '[]', 'scheduled',
  case when trio_home then array[trio_1, substitute] else array[]::uuid[] end, case when trio_home then array[]::uuid[] else array[trio_1, substitute] end,
  case when trio_home then substitute end, case when trio_home then null else substitute end)), null, 'the team saves the lineup with a substitute')
from ctx, lateral (select home_team_id = tests.team_id('Trio') as trio_home from public.matches where id = ctx.trio_match) side;
select isnt(tests.run_as(trio_1, format('select public.approve_match_substitute(%L, %L)', trio_match, tests.team_id('Trio'))), null, 'a team cannot approve its own substitute') from ctx;
select is(tests.run_as(duo_captain, format('select public.approve_match_substitute(%L, %L)', trio_match, tests.team_id('Trio'))), null, 'the opponent approves the substitute') from ctx;
select is(pg_temp.save_trio_result(trio_1, array[trio_1, substitute], substitute), null, 'after approval the result can be recorded') from ctx;
select is((select status from public.matches where id = (select trio_match from ctx)), 'completed', 'the match is completed');

-- Mixty
create function pg_temp.save_mixty_lineup(lineup uuid[])
returns text
language sql
as $$
  select tests.run_as(ctx.mixty_man, format('select public.save_match_details(%L, null, null, null, null, %L::jsonb, null, %L, %L::uuid[], %L::uuid[], null, null)',
    ctx.mixty_match, '[]', 'scheduled',
    case when mixty_home then lineup else array[]::uuid[] end, case when mixty_home then array[]::uuid[] else lineup end))
  from ctx, lateral (select home_team_id = tests.team_id('Mixty 1') as mixty_home from public.matches where id = ctx.mixty_match) side;
$$;
select isnt(pg_temp.save_mixty_lineup(array[mixty_man, mixty_man_2]), null, 'a Mixty pair of two men is rejected') from ctx;
select is(pg_temp.save_mixty_lineup(array[mixty_man, mixty_woman]), null, 'a Mixty pair of a man and a woman is accepted') from ctx;

-- Rakenne
select isnt(tests.run_as(trio_1, format('select public.save_match_details(%L, null, null, 2, 0, %L::jsonb, null, %L, array[]::uuid[], array[]::uuid[], null, null)', mixty_match, '[]', 'completed')), null, 'a player cannot record a match of another division') from ctx;

select * from finish();
rollback;
