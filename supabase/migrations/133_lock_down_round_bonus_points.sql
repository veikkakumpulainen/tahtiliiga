-- league_round_bonus_points (043) never had RLS enabled and kept the default
-- full grants, so anyone - even without logging in - could insert, change or
-- delete group-win bonus points straight through the REST API. Nothing in
-- the app reads or writes the table directly: complete_league_round writes
-- it and the standings functions read it, all security definer.
alter table public.league_round_bonus_points enable row level security;
revoke all on public.league_round_bonus_points from anon, authenticated;
