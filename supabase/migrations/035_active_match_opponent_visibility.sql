drop policy if exists "users can read active match opponents" on public.teams;
create policy "users can read active match opponents" on public.teams
for select to authenticated using (
  exists (
    select 1
    from public.matches match
    join public.league_rounds round on round.id = match.league_round_id
    where round.status = 'active'
      and (teams.id = match.home_team_id or teams.id = match.away_team_id)
      and public.is_team_member(case when match.home_team_id = teams.id then match.away_team_id else match.home_team_id end)
  )
);