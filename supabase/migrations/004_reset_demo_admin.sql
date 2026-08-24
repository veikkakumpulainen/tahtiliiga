-- Development-only repair for the demo admin account.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '10000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'admin@demo.tahtiliiga.fi',
  crypt('salasana', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"first_name":"Tahti","last_name":"Admin","gender":"prefer_not_to_say","skill_level":"A"}',
  now(),
  now()
)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = now(),
  confirmation_token = '',
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

update public.profiles
set role = 'admin', first_name = 'Tahti', last_name = 'Admin', updated_at = now()
where id = '10000000-0000-0000-0000-000000000003';