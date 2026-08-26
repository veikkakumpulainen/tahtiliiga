alter table public.teams
  drop constraint if exists teams_skill_level_check;

alter table public.teams
  add constraint teams_skill_level_check
  check (skill_level in ('A', 'B', 'C', 'D', 'E', 'Aloittelija'));
