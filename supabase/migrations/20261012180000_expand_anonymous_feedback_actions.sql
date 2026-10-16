-- =====================================================================
-- Migration: 20261012180000_expand_anonymous_feedback_actions.sql
-- Description: Mở rộng trạng thái phản hồi ẩn danh (new, processing, resolved, rejected)
--              và bổ sung RPC xóa phản hồi cho admin.
-- =====================================================================

-- 1. Cập nhật ràng buộc trạng thái
ALTER TABLE public.anonymous_feedback DROP CONSTRAINT IF EXISTS anonymous_feedback_status_check;
ALTER TABLE public.anonymous_feedback ADD CONSTRAINT anonymous_feedback_status_check 
  CHECK (status = ANY (ARRAY['new'::text, 'seen'::text, 'processing'::text, 'resolved'::text, 'rejected'::text]));

-- 2. Cập nhật RPC admin_update_anonymous_feedback
CREATE OR REPLACE FUNCTION public.admin_update_anonymous_feedback(p_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  IF p_status NOT IN ('new', 'seen', 'processing', 'resolved', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  END IF;

  UPDATE public.anonymous_feedback
  SET status = p_status, updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy phản hồi.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

-- 3. RPC admin_delete_anonymous_feedback
CREATE OR REPLACE FUNCTION public.admin_delete_anonymous_feedback(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không có quyền admin.');
  END IF;

  DELETE FROM public.anonymous_feedback WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy phản hồi để xóa.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_anonymous_feedback(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_anonymous_feedback(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_anonymous_feedback(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_anonymous_feedback(uuid) TO authenticated;
