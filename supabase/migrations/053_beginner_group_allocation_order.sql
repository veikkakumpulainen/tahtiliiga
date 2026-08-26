create or replace function public.assign_registered_teams_to_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  league_status text;
  allocation_enabled boolean;
  team_count integer;
  group_number integer;
  target_group_id uuid;
  team_record record;
begin
  -- Serialise registrations for the same league before recalculating its groups.
  perform pg_advisory_xact_lock(hashtext(new.league_id::text));

  select status, automatic_group_allocation into league_status, allocation_enabled
  from public.leagues
  where id = new.league_id;

  if league_status <> 'registration_open' or not allocation_enabled then
    return new;
  end if;

  perform set_config('tahtiliiga.automatic_group_allocation', 'true', true);

  select count(*) into team_count
  from public.teams
  where league_id = new.league_id;

  for group_number in 1..ceil(team_count / 4.0)::integer loop
    insert into public.groups (league_id, name, status)
    values (new.league_id, format('Lohko %s', group_number), 'draft')
    on conflict (league_id, name) do nothing;
  end loop;

  delete from public.group_teams assignment
  using public.groups league_group
  where assignment.group_id = league_group.id
    and league_group.league_id = new.league_id;

  for team_record in
    select
      id,
      ceil(row_number() over (
        order by case skill_level when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 when 'E' then 5 when 'Aloittelija' then 6 else 7 end, created_at, id
      ) / 4.0)::integer as group_number
    from public.teams
    where league_id = new.league_id
  loop
    select id into target_group_id
    from public.groups
    where league_id = new.league_id
      and name = format('Lohko %s', team_record.group_number);

    insert into public.group_teams (group_id, team_id)
    values (target_group_id, team_record.id);
  end loop;

  return new;
end;
$$;
