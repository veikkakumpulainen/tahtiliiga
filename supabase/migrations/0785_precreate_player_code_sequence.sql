-- 079_player_codes.sql calls setval(seq, coalesce(max(player_code), 0)),
-- which fails on a genuinely empty profiles table because 0 is out of
-- bounds for a sequence's default minvalue of 1. That never surfaced
-- because production already had profiles by the time 079 ran; replaying
-- this history from scratch on an empty database fails there. Pre-create
-- the sequence with minvalue 0 so 079's own setval(..., 0) call succeeds -
-- the first real nextval() still correctly returns 1.
create sequence if not exists public.profiles_player_code_seq minvalue 0;
