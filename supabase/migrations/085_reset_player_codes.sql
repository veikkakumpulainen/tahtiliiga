-- One-time renumbering after a database wipe: player_code jumped straight
-- to 75/76 for the first two players because the sequence was never reset.
-- Remap existing profiles back to a clean 1, 2, 3... run (ordered by their
-- current player_code, i.e. registration order) and reset the sequence so
-- the next registration continues right after the last one here.
--
-- player_code is otherwise immutable (see prevent_player_code_change in
-- 079_player_codes.sql), so the trigger is disabled for this one-time
-- backfill only.

alter table public.profiles disable trigger player_code_immutable;

-- Two passes (negative, then positive) avoid transient collisions with the
-- unique player_code constraint while remapping values in place.
with numbered as (
  select id, row_number() over (order by player_code) as rn
  from public.profiles
)
update public.profiles profile
set player_code = -numbered.rn
from numbered
where profile.id = numbered.id;

update public.profiles
set player_code = -player_code
where player_code < 0;

select setval('public.profiles_player_code_seq', coalesce((select max(player_code) from public.profiles), 0));

alter table public.profiles enable trigger player_code_immutable;
