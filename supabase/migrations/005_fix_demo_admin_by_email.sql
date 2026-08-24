-- Development-only repair when the demo admin already exists with another UUID.
update auth.users
set
  encrypted_password = crypt('salasana', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmation_token = '',
  updated_at = now()
where lower(email) = lower('admin@demo.tahtiliiga.fi');

insert into public.profiles (id, first_name, last_name, email, gender, skill_level, role)
select id, 'Tahti', 'Admin', email, 'prefer_not_to_say', 'A', 'admin'
from auth.users
where lower(email) = lower('admin@demo.tahtiliiga.fi')
on conflict (id) do update set
  first_name = 'Tahti',
  last_name = 'Admin',
  role = 'admin',
  updated_at = now();

select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('admin@demo.tahtiliiga.fi');