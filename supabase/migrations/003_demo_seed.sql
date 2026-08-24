-- Development-only demo accounts. Change or remove these credentials before production.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'matti@demo.tahtiliiga.fi', crypt('salasana', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Matti","last_name":"Meikäläinen","phone":"+358401234567","gender":"male","skill_level":"B"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ville@demo.tahtiliiga.fi', crypt('salasana', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Ville","last_name":"Virtanen","phone":"+358401234568","gender":"male","skill_level":"B"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin@demo.tahtiliiga.fi', crypt('salasana', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Tahti","last_name":"Admin","gender":"prefer_not_to_say","skill_level":"A"}', now(), now())
on conflict (id) do nothing;

update public.profiles
set role = 'admin', updated_at = now()
where id = '10000000-0000-0000-0000-000000000003';

insert into public.leagues (id, name, start_date, registration_deadline, status, created_by)
values ('20000000-0000-0000-0000-000000000001', 'Jyväskylä Padel - Syksy 2026', '2026-09-01', '2026-08-25', 'ongoing', '10000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.teams (id, league_id, name, skill_level, skill_description, captain_id, created_by)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Team Alpha', 'B', 'Aktiivinen harrastejoukkue', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Team Beta', 'B', 'Pelataan viikoittain', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Team Smash', 'C', null, '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Padel Kings', 'C', null, '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.team_members (id, team_id, user_id, is_captain)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', true),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', true),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', true),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', true)
on conflict (id) do nothing;

insert into public.groups (id, league_id, name)
values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Lohko A')
on conflict (id) do nothing;

insert into public.group_teams (id, group_id, team_id)
values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003'),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004')
on conflict (id) do nothing;

insert into public.matches (id, league_id, group_id, home_team_id, away_team_id, home_score, away_score, status, scheduled_at, venue)
values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', null, null, 'scheduled', '2026-09-06 18:00:00+03', 'Hippos Padel'),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', null, null, 'scheduled', null, null),
  ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', null, null, 'scheduled', null, null),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 6, 4, 'completed', '2026-09-04 18:00:00+03', 'Hippos Padel'),
  ('70000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004', null, null, 'scheduled', null, null),
  ('70000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', null, null, 'scheduled', null, null)
on conflict (id) do nothing;

update public.matches
set home_score = 6, away_score = 4, updated_at = now()
where id = '70000000-0000-0000-0000-000000000004';

insert into public.payments (id, team_id, user_id, amount, payment_status, payment_method)
values ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 120.00, 'paid', 'team')
on conflict (id) do nothing;

insert into public.group_messages (id, group_id, user_id, message)
values ('90000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Sopisiko meille sunnuntaina klo 18?')
on conflict (id) do nothing;