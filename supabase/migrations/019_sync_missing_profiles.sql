-- Creates public profile rows for Auth users created before the profile trigger was fixed.
insert into public.profiles (id, first_name, last_name, email, phone, gender, skill_level, role)
select
  u.id,
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''), 'Pelaaja'),
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'last_name'), ''), 'Uusi'),
  lower(u.email),
  nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
  nullif(u.raw_user_meta_data ->> 'gender', ''),
  nullif(u.raw_user_meta_data ->> 'skill_level', ''),
  'user'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

select
  u.email,
  p.first_name,
  p.last_name,
  p.role
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;