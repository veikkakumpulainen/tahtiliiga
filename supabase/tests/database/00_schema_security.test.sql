-- Jokaisessa public-skeeman taulussa pitää olla RLS päällä: muuten taulu on
-- kenen tahansa luettavissa ja muokattavissa REST-rajapinnan kautta.
begin;
\ir helpers.psql
select plan(3);

select is(
  array(select relname::text from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity order by relname),
  array[]::text[],
  'every table in the public schema has row level security enabled');

create temp table ctx as select tests.create_user('pelaaja@test.fi') as player_id;
select isnt(tests.run_as(player_id, $$ insert into public.league_round_bonus_points (league_round_id, team_id, points) values (gen_random_uuid(), gen_random_uuid(), 10) $$), null, 'a player cannot write bonus points') from ctx;
select isnt(tests.run_as(null, $$ delete from public.league_round_bonus_points $$), null, 'an anonymous user cannot touch bonus points');

select * from finish();
rollback;
