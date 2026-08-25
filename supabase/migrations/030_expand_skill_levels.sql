alter table public.profiles
  drop constraint if exists profiles_skill_level_check;

alter table public.profiles
  add constraint profiles_skill_level_check
  check (skill_level is null or skill_level in (
    'A', 'B', 'C', 'D',
    'Miesten A', 'Miesten B', 'Miesten C', 'Miesten D', 'Miesten E',
    'Naisten A', 'Naisten B', 'Naisten C', 'Naisten D', 'Naisten E'
  ));

alter table public.teams
  drop constraint if exists teams_skill_level_check;

alter table public.teams
  add constraint teams_skill_level_check
  check (skill_level in ('A', 'B', 'C', 'D', 'E'));