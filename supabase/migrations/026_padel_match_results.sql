alter table public.matches
  add column if not exists set_scores jsonb not null default '[]'::jsonb;

alter table public.matches
  add column if not exists walkover_winner_id uuid references public.teams(id);

alter table public.matches
  drop constraint if exists matches_set_scores_array;

alter table public.matches
  add constraint matches_set_scores_array
  check (jsonb_typeof(set_scores) = 'array');

alter table public.matches
  drop constraint if exists matches_walkover_winner_is_participant;

alter table public.matches
  add constraint matches_walkover_winner_is_participant
  check (
    walkover_winner_id is null
    or walkover_winner_id = home_team_id
    or walkover_winner_id = away_team_id
  );