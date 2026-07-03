-- Enable Row-Level Security on user_swiggy_tokens.
--
-- Same reasoning as migration 007: our backend connects as the
-- `postgres` superuser via the connection string and superusers
-- bypass RLS by default. So this closes the anon-role attack
-- surface (PostgREST via Supabase's public REST API) without
-- affecting our application path.
--
-- Especially important for THIS table because it holds encrypted
-- OAuth tokens — even the encrypted rows shouldn't be readable
-- via anon.

ALTER TABLE user_swiggy_tokens ENABLE ROW LEVEL SECURITY;
