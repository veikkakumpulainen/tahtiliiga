-- 024_league_standings_rpc.sql references matches.walkover_winner_id, but
-- that column isn't added until 026_padel_match_results.sql. That only ever
-- worked because production had already applied later migrations out of
-- this file's order; replaying this history from scratch on an empty
-- database fails at 024. Pre-create the column here so a from-scratch
-- replay succeeds - 026's own "add column if not exists" is a no-op after.
alter table public.matches
  add column if not exists walkover_winner_id uuid references public.teams(id);
