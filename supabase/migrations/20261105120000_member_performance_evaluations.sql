-- Migration: 20261105120000_member_performance_evaluations.sql
-- Description: Create member_performance_evaluations table, indexes, RLS policies,
--              and save_captain_adjustment RPC function.

-- 1. Create table public.member_performance_evaluations
CREATE TABLE IF NOT EXISTS public.member_performance_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mssv text NOT NULL REFERENCES public.students(mssv) ON DELETE CASCADE,
  period_key text NOT NULL DEFAULT 'default',
  period_from date,
  period_to date,
  captain_adjustment numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  adjusted_by text DEFAULT 'Đội trưởng',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_member_perf_eval UNIQUE (mssv, period_key)
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_member_perf_eval_mssv_period
  ON public.member_performance_evaluations (mssv, period_key);

CREATE INDEX IF NOT EXISTS idx_member_perf_eval_period
  ON public.member_performance_evaluations (period_key);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_member_performance_evaluations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  return new;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_performance_evaluations_updated_at
  ON public.member_performance_evaluations;

CREATE TRIGGER trg_member_performance_evaluations_updated_at
  BEFORE UPDATE ON public.member_performance_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_performance_evaluations_updated_at();

-- 4. Row Level Security (RLS)
ALTER TABLE public.member_performance_evaluations ENABLE ROW LEVEL SECURITY;

-- 4.1. SELECT policy: authenticated users, admin, team leaders, anon
DROP POLICY IF EXISTS "member_perf_eval_select_policy" ON public.member_performance_evaluations;
CREATE POLICY "member_perf_eval_select_policy"
  ON public.member_performance_evaluations
  FOR SELECT
  TO authenticated, anon
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_groups tg
      JOIN public.team_group_members tgm ON tgm.team_id = tg.id
      WHERE tg.leader_mssv = (SELECT p.mssv FROM public.profiles p WHERE p.user_id = auth.uid())
        AND tgm.mssv = member_performance_evaluations.mssv
    )
    OR auth.role() = 'authenticated'
    OR true
  );

-- 4.2. INSERT policy: admin, team leaders, or authenticated
DROP POLICY IF EXISTS "member_perf_eval_insert_policy" ON public.member_performance_evaluations;
CREATE POLICY "member_perf_eval_insert_policy"
  ON public.member_performance_evaluations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_groups tg
      JOIN public.team_group_members tgm ON tgm.team_id = tg.id
      WHERE tg.leader_mssv = (SELECT p.mssv FROM public.profiles p WHERE p.user_id = auth.uid())
        AND tgm.mssv = member_performance_evaluations.mssv
    )
    OR auth.role() = 'authenticated'
  );

-- 4.3. UPDATE policy: admin, team leaders, or authenticated
DROP POLICY IF EXISTS "member_perf_eval_update_policy" ON public.member_performance_evaluations;
CREATE POLICY "member_perf_eval_update_policy"
  ON public.member_performance_evaluations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_groups tg
      JOIN public.team_group_members tgm ON tgm.team_id = tg.id
      WHERE tg.leader_mssv = (SELECT p.mssv FROM public.profiles p WHERE p.user_id = auth.uid())
        AND tgm.mssv = member_performance_evaluations.mssv
    )
    OR auth.role() = 'authenticated'
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_groups tg
      JOIN public.team_group_members tgm ON tgm.team_id = tg.id
      WHERE tg.leader_mssv = (SELECT p.mssv FROM public.profiles p WHERE p.user_id = auth.uid())
        AND tgm.mssv = member_performance_evaluations.mssv
    )
    OR auth.role() = 'authenticated'
  );

-- 4.4. DELETE policy: admin or authenticated
DROP POLICY IF EXISTS "member_perf_eval_delete_policy" ON public.member_performance_evaluations;
CREATE POLICY "member_perf_eval_delete_policy"
  ON public.member_performance_evaluations
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR auth.role() = 'authenticated'
  );

-- 4.5. Grant permissions on table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_performance_evaluations TO authenticated;
GRANT SELECT ON TABLE public.member_performance_evaluations TO anon;
GRANT ALL ON TABLE public.member_performance_evaluations TO service_role;

-- 5. Realtime publication (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'member_performance_evaluations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.member_performance_evaluations;
    END IF;
  END IF;
END $$;

-- 6. RPC Function: save_captain_adjustment
CREATE OR REPLACE FUNCTION public.save_captain_adjustment(
  p_mssv text,
  p_period_key text DEFAULT 'default',
  p_adjustment numeric DEFAULT 0,
  p_notes text DEFAULT '',
  p_period_from date DEFAULT NULL,
  p_period_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mssv text := btrim(coalesce(p_mssv, ''));
  v_period_key text := coalesce(nullif(btrim(p_period_key), ''), 'default');
  v_adjustment numeric := coalesce(p_adjustment, 0);
  v_notes text := coalesce(p_notes, '');
  v_adjusted_by text;
  v_result public.member_performance_evaluations%rowtype;
BEGIN
  -- Validate required input
  IF v_mssv = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'error',
      'message', 'MSSV không được để trống.'
    );
  END IF;

  -- Permission verification
  IF v_uid IS NOT NULL THEN
    IF NOT (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.team_groups tg
        JOIN public.team_group_members tgm ON tgm.team_id = tg.id
        JOIN public.profiles p ON p.user_id = v_uid
        WHERE tg.leader_mssv = p.mssv AND tgm.mssv = v_mssv
      )
      OR auth.role() = 'authenticated'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'error',
        'message', 'Không có quyền thực hiện điều chỉnh điểm.'
      );
    END IF;

    -- Look up name from profiles
    SELECT coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.mssv), ''), 'Đội trưởng')
      INTO v_adjusted_by
    FROM public.profiles p
    WHERE p.user_id = v_uid;
  END IF;

  IF v_adjusted_by IS NULL OR v_adjusted_by = '' THEN
    v_adjusted_by := 'Đội trưởng';
  END IF;

  -- Verify student existence
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE mssv = v_mssv) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'error',
      'message', 'Không tìm thấy sinh viên có MSSV: ' || v_mssv
    );
  END IF;

  -- Atomic upsert
  INSERT INTO public.member_performance_evaluations (
    mssv,
    period_key,
    period_from,
    period_to,
    captain_adjustment,
    notes,
    adjusted_by,
    created_at,
    updated_at
  )
  VALUES (
    v_mssv,
    v_period_key,
    p_period_from,
    p_period_to,
    v_adjustment,
    v_notes,
    v_adjusted_by,
    now(),
    now()
  )
  ON CONFLICT (mssv, period_key)
  DO UPDATE SET
    period_from = coalesce(excluded.period_from, public.member_performance_evaluations.period_from),
    period_to = coalesce(excluded.period_to, public.member_performance_evaluations.period_to),
    captain_adjustment = excluded.captain_adjustment,
    notes = excluded.notes,
    adjusted_by = excluded.adjusted_by,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ok',
    'data', to_jsonb(v_result)
  );

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'error',
      'message', 'MSSV không tồn tại trong danh sách sinh viên.'
    );
  WHEN others THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'error',
      'message', SQLERRM
    );
END;
$$;

-- 7. Grant permissions on RPC function
REVOKE ALL ON FUNCTION public.save_captain_adjustment(text, text, numeric, text, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.save_captain_adjustment(text, text, numeric, text, date, date) TO authenticated, anon, service_role;
