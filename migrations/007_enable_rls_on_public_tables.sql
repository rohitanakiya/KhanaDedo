-- Enables Row-Level Security on every public table.
--
-- Why: Supabase exposes a public REST API (PostgREST) keyed by the
-- "anon" role. With RLS off, anyone holding the anon key could read
-- or write these tables.
--
-- We don't use Supabase Auth or PostgREST — our backend connects as
-- the `postgres` superuser via the connection string and superusers
-- bypass RLS by default. So enabling RLS here costs us nothing on
-- our application path while closing the anon-role attack surface
-- completely.
--
-- Without policies, RLS = "deny everything" for non-superuser roles.
-- That's exactly what we want for tables that should not be reachable
-- via PostgREST.

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE _migrations    ENABLE ROW LEVEL SECURITY;
