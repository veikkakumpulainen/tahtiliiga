-- Flipping leagues.automatic_group_allocation back on (or just wanting to
-- reshuffle groups by current skill levels) doesn't retroactively run
-- anything - the allocation logic only ever ran from the AFTER INSERT
-- trigger on teams. Pull that logic out into its own function so an admin
-- can also invoke it on demand for a league's already-registered teams.

create or replace function public.auto_assign_league_groups(target_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  category_row record;
  team_count integer;
  group_number integer;
  target_group_id uuid;
  team_record record;
begin
  perform pg_advisory_xact_lock(hashtext(target_league_id::text));

  for category_row in
    select distinct category from public.teams where league_id = target_league_id
  loop
    select count(*) into team_count
    from public.teams
    where league_id = target_league_id and category = category_row.category;

    for group_number in 1..ceil(team_count / 4.0)::integer loop
      insert into public.groups (league_id, category, name, status)
      values (target_league_id, category_row.category, format('Lohko %s', group_number), 'draft')
      on conflict (league_id, category, name) do nothing;
    end loop;

    delete from public.group_teams assignment
    using public.groups league_group
    where assignment.group_id = league_group.id
      and league_group.league_id = target_league_id
      and league_group.category = category_row.category;

    for team_record in
      select
        id,
        ceil(row_number() over (
          order by case skill_level when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 when 'E' then 5 when 'Aloittelija' then 6 else 7 end, created_at, id
        ) / 4.0)::integer as group_number
      from public.teams
      where league_id = target_league_id and category = category_row.category
    loop
      select id into target_group_id
      from public.groups
      where league_id = target_league_id
        and category = category_row.category
        and name = format('Lohko %s', team_record.group_number);

      insert into public.group_teams (group_id, team_id)
      values (target_group_id, team_record.id);
    end loop;
  end loop;
end;
$$;

revoke all on function public.auto_assign_league_groups(uuid) from public;

create or replace function public.assign_registered_teams_to_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  league_status text;
  allocation_enabled boolean;
begin
  select status, automatic_group_allocation into league_status, allocation_enabled
  from public.leagues
  where id = new.league_id;

  if league_status <> 'registration_open' or not allocation_enabled then
    return new;
  end if;

  perform set_config('tahtiliiga.automatic_group_allocation', 'true', true);
  perform public.auto_assign_league_groups(new.league_id);

  return new;
end;
$$;

create or replace function public.admin_auto_assign_groups(target_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can auto-assign groups';
  end if;

  if not exists (
    select 1 from public.leagues
    where id = target_league_id and status in ('registration_open', 'registration_closed')
  ) then
    raise exception 'League must be open or closed for registration to auto-assign groups';
  end if;

  if not exists (select 1 from public.teams where league_id = target_league_id) then
    raise exception 'League has no registered teams yet';
  end if;

  perform set_config('tahtiliiga.automatic_group_allocation', 'true', true);
  perform public.auto_assign_league_groups(target_league_id);
end;
$$;

revoke all on function public.admin_auto_assign_groups(uuid) from public;
grant execute on function public.admin_auto_assign_groups(uuid) to authenticated;
