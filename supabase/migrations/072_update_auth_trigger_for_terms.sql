-- Update handle_new_user trigger to capture marketing preference and set acceptance timestamps

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, email, phone, gender, skill_level, role, 
    marketing_accepted, terms_accepted_at, privacy_accepted_at
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), 'Pelaaja'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), 'Uusi'),
    lower(new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'skill_level', ''),
    'user',
    coalesce((new.raw_user_meta_data ->> 'marketing_accepted')::boolean, false),
    NOW(),
    NOW()
  )
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    gender = excluded.gender,
    skill_level = excluded.skill_level,
    marketing_accepted = coalesce((new.raw_user_meta_data ->> 'marketing_accepted')::boolean, false),
    terms_accepted_at = CASE WHEN profiles.terms_accepted_at IS NULL THEN NOW() ELSE profiles.terms_accepted_at END,
    privacy_accepted_at = CASE WHEN profiles.privacy_accepted_at IS NULL THEN NOW() ELSE profiles.privacy_accepted_at END;
  return new;
end;
$$;
