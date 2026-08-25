-- Keep registration-time groups balanced by skill level, with at most four teams per group.
alter table public.leagues
  add column if not exists automatic_group_allocation boolean not null default true;

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
        order by case skill_level when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 else 5 end, created_at, id
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

create or replace function public.disable_automatic_group_allocation_after_manual_group_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
begin
  if current_setting('tahtiliiga.automatic_group_allocation', true) = 'true' then
    return null;
  end if;

  if tg_table_name = 'groups' then
    target_league_id := case when tg_op = 'DELETE' then old.league_id else new.league_id end;
  else
    select league_id into target_league_id
    from public.groups
    where id = case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  end if;

  update public.leagues
  set automatic_group_allocation = false
  where id = target_league_id
    and status = 'registration_open';

  return null;
end;
$$;

drop trigger if exists disable_automatic_group_allocation_on_group_change on public.groups;
create trigger disable_automatic_group_allocation_on_group_change
after insert or update or delete on public.groups
for each row execute function public.disable_automatic_group_allocation_after_manual_group_change();

drop trigger if exists disable_automatic_group_allocation_on_assignment_change on public.group_teams;
create trigger disable_automatic_group_allocation_on_assignment_change
after insert or update or delete on public.group_teams
for each row execute function public.disable_automatic_group_allocation_after_manual_group_change();

drop trigger if exists assign_registered_teams_to_groups on public.teams;
create trigger assign_registered_teams_to_groups
after insert on public.teams
for each row execute function public.assign_registered_teams_to_groups();