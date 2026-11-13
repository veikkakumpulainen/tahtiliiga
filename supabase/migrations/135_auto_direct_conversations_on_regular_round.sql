-- When a regular round starts, every captain gets a private conversation
-- with each of the other captains in their lohko right away (one per team
-- pair, as start_direct_conversation would create). The round-start trigger
-- from 130 already wipes the league's conversations; extend that same
-- function so the fresh set is created after the wipe. A qualification round
-- only clears them (its chat is the qualification match chat).

create or replace function public.clear_direct_conversations_on_round_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.direct_conversations where league_id = new.league_id;

  if new.round_type = 'regular' then
    insert into public.direct_conversations (league_id, group_id, team_a_id, team_b_id)
    select league_group.league_id, team_a.group_id, team_a.team_id, team_b.team_id
    from public.group_teams team_a
    join public.group_teams team_b on team_b.group_id = team_a.group_id and team_b.team_id > team_a.team_id
    join public.groups league_group on league_group.id = team_a.group_id
    where league_group.league_id = new.league_id
    on conflict (group_id, team_a_id, team_b_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.clear_direct_conversations_on_round_start() from public, anon, authenticated;

-- Backfill for regular rounds already running when this ships.
insert into public.direct_conversations (league_id, group_id, team_a_id, team_b_id)
select league_group.league_id, team_a.group_id, team_a.team_id, team_b.team_id
from public.league_rounds round
join public.groups league_group on league_group.league_id = round.league_id
join public.group_teams team_a on team_a.group_id = league_group.id
join public.group_teams team_b on team_b.group_id = team_a.group_id and team_b.team_id > team_a.team_id
where round.status = 'active' and round.round_type = 'regular'
on conflict (group_id, team_a_id, team_b_id) do nothing;
