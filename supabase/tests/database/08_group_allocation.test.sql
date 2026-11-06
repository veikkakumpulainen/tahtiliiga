-- Automaattinen lohkojako: neljän joukkueen lohkot taitotason mukaan,
-- vahvimmat ylimpään lohkoon, viimeiseen lohkoon jää loput.
begin;
\ir helpers.psql
select plan(6);

create temp table ctx as
select tests.create_user('admin@test.fi', 'Ylla', 'Pito', 'male', true) as admin_id;
alter table ctx add column league_id uuid;
update ctx set league_id = tests.create_league(admin_id, 'registration_closed');

-- 11 joukkuetta: 3 A-tason, 4 B-tason, 4 C-tason.
select tests.create_team(league_id, 'Joukkue ' || n, array[tests.create_user('p' || n || '@test.fi'), tests.create_user('q' || n || '@test.fi')], 'avoin',
  case when n <= 3 then 'A' when n <= 7 then 'B' else 'C' end)
from ctx, generate_series(1, 11) n;

select isnt(tests.run_as((select captain_id from public.teams where name = 'Joukkue 1'), format('select public.admin_auto_assign_groups(%L)', league_id)), null, 'a player cannot run the allocation') from ctx;
select is(tests.run_as(admin_id, format('select public.admin_auto_assign_groups(%L)', league_id)), null, 'admin runs the allocation') from ctx;

create temp table allocation as
select league_group.name as group_name, team.name as team_name, team.skill_level
from public.group_teams assignment
join public.groups league_group on league_group.id = assignment.group_id
join public.teams team on team.id = assignment.team_id
where team.league_id = (select league_id from ctx);

select is((select array_agg(size order by group_name) from (select group_name, count(*)::integer as size from allocation group by group_name) sizes), array[4, 4, 3], '11 teams make groups of 4, 4 and 3');
select is((select count(*)::integer from allocation), 11, 'every team gets a group');
select is((select array_agg(distinct skill_level) from allocation where group_name = 'Lohko 1' and skill_level = 'A'), array['A'], 'the A teams are in Lohko 1');
select is((select array_agg(distinct skill_level order by skill_level) from allocation where group_name = 'Lohko 3'), array['C'], 'the weakest teams are in the bottom group');

select * from finish();
rollback;
