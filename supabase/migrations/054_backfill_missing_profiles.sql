-- Re-affirm the auth.users -> public.profiles sync trigger, then backfill any
-- users that exist in auth.users but never got a matching profiles row
-- (e.g. because the trigger was missing or broken at the time they signed up).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email, phone, gender, skill_level, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Pelaaja'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Uusi'),
    lower(new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'skill_level', ''),
    'user'
  )
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    gender = excluded.gender,
    skill_level = excluded.skill_level;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, first_name, last_name, email, phone, gender, skill_level, role)
select
  auth_user.id,
  coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'first_name'), ''), 'Pelaaja'),
  coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'last_name'), ''), 'Uusi'),
  lower(auth_user.email),
  nullif(btrim(auth_user.raw_user_meta_data ->> 'phone'), ''),
  nullif(auth_user.raw_user_meta_data ->> 'gender', ''),
  nullif(auth_user.raw_user_meta_data ->> 'skill_level', ''),
  'user'
from auth.users auth_user
where not exists (
  select 1
  from public.profiles profile
  where profile.id = auth_user.id
);
