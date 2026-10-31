-- Migration: 20261031030000_enable_realtime_sessions_and_read_policy.sql
-- Description: Enable Supabase Realtime for public.sessions and grant RLS SELECT policy for students and anon.

-- 1. Idempotently add public.sessions to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;
END $$;

-- 2. Ensure RLS is enabled on public.sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- 3. Add SELECT policy on public.sessions for anon and authenticated roles
DROP POLICY IF EXISTS "sessions_read_policy" ON public.sessions;
DROP POLICY IF EXISTS "sessions_select_all" ON public.sessions;

CREATE POLICY "sessions_read_policy" ON public.sessions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. Grant SELECT permission to anon and authenticated roles
GRANT SELECT ON TABLE public.sessions TO anon, authenticated;
