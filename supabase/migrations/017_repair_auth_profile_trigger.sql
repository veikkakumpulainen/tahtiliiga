-- Aligns an existing database with the current optional profile fields.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists skill_level text;
alter table public.profiles add column if not exists role text default 'user';

alter table public.profiles alter column skill_level drop not null;
alter table public.profiles alter column role set default 'user';

drop trigger if exists on_auth_user_created on auth.users;

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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();