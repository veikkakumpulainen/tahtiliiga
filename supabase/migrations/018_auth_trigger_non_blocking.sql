-- Keeps Supabase Auth user creation from failing because of a profile-side constraint.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    on conflict (id) do nothing;
  exception when others then
    raise warning 'Profile creation skipped for auth user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();