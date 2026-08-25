create or replace function public.search_profiles_by_name(search_query text)
returns table (id uuid, first_name text, last_name text)
language sql
security definer
set search_path = public
as $$
  select profile.id, profile.first_name, profile.last_name
  from public.profiles profile
  where auth.uid() is not null
    and char_length(btrim(search_query)) >= 2
    and concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(search_query) || '%'
  order by profile.first_name, profile.last_name
  limit 10;
$$;

revoke all on function public.search_profiles_by_name(text) from public;
grant execute on function public.search_profiles_by_name(text) to authenticated;