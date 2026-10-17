-- =====================================================================
-- Migration: Fix Avatar Admin & Hỗ trợ Chat Trao đổi Đơn xin nghỉ
-- =====================================================================

-- Đảm bảo profiles có cột avatar_url
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 1. RPC cập nhật avatar trực tiếp cho Admin (chạy bằng Security Definer không bị RLS chặn)
CREATE OR REPLACE FUNCTION public.admin_update_avatar(
  p_mssv text,
  p_avatar text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_target_mssv text := btrim(coalesce(p_mssv, ''));
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
BEGIN
  IF v_target_mssv = '' THEN
    SELECT p.mssv INTO v_target_mssv FROM public.profiles p WHERE p.user_id = auth.uid();
  END IF;

  IF v_target_mssv IS NULL OR v_target_mssv = '' THEN
    v_target_mssv := '123001058';
  END IF;

  -- Cập nhật bảng students
  UPDATE public.students 
  SET avatar = v_avatar 
  WHERE mssv = v_target_mssv;

  IF NOT FOUND THEN
    INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
    VALUES (v_target_mssv, 'Nguyễn Khánh Hòa', '23TD111', '', v_avatar, true);
  END IF;

  -- Cập nhật bảng profiles
  UPDATE public.profiles 
  SET avatar_url = v_avatar 
  WHERE mssv = v_target_mssv;

  RETURN jsonb_build_object('ok', true, 'mssv', v_target_mssv, 'avatar', v_avatar);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.admin_update_avatar(text, text) TO authenticated, anon;


-- 2. RPC submit_leave_comment cho phép trao đổi phản hồi trên đơn xin nghỉ
CREATE OR REPLACE FUNCTION public.submit_leave_comment(
  p_leave_id uuid,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $func$
DECLARE
  v_req public.leave_requests%rowtype;
  v_notes jsonb;
  v_new_msg jsonb;
  v_sender_name text;
  v_current_user uuid;
  v_is_admin_user boolean;
  v_role text;
BEGIN
  v_current_user := auth.uid();
  IF v_current_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Vui lòng đăng nhập để gửi tin nhắn.');
  END IF;

  SELECT * INTO v_req FROM public.leave_requests WHERE id = p_leave_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy đơn xin nghỉ.');
  END IF;

  v_is_admin_user := is_admin();
  IF v_current_user <> coalesce(v_req.requested_by, '00000000-0000-0000-0000-000000000000'::uuid) AND NOT v_is_admin_user THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Bạn không có quyền phản hồi đơn này.');
  END IF;

  IF v_is_admin_user THEN
    v_role := 'admin';
    v_sender_name := 'Quản lý';
  ELSE
    v_role := 'student';
    SELECT coalesce(nullif(btrim(full_name), ''), v_req.mssv) INTO v_sender_name
    FROM public.profiles WHERE user_id = v_current_user;
    IF v_sender_name IS NULL THEN v_sender_name := v_req.mssv; END IF;
  END IF;

  -- Parse mảng JSON tin nhắn hiện tại từ reviewer_note
  BEGIN
    v_notes := v_req.reviewer_note::jsonb;
    IF jsonb_typeof(v_notes) <> 'array' THEN
      IF v_req.reviewer_note IS NOT NULL AND btrim(v_req.reviewer_note) <> '' THEN
        v_notes := jsonb_build_array(jsonb_build_object(
          'id', 'msg_legacy',
          'sender', 'admin',
          'name', 'Quản lý',
          'text', v_req.reviewer_note,
          'time', to_char(coalesce(v_req.reviewed_at, v_req.updated_at, now()), 'HH24:MI DD/MM')
        ));
      ELSE
        v_notes := '[]'::jsonb;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF v_req.reviewer_note IS NOT NULL AND btrim(v_req.reviewer_note) <> '' THEN
      v_notes := jsonb_build_array(jsonb_build_object(
        'id', 'msg_legacy',
        'sender', 'admin',
        'name', 'Quản lý',
        'text', v_req.reviewer_note,
        'time', to_char(coalesce(v_req.reviewed_at, v_req.updated_at, now()), 'HH24:MI DD/MM')
      ));
    ELSE
      v_notes := '[]'::jsonb;
    END IF;
  END;

  -- Tạo message mới
  v_new_msg := jsonb_build_object(
    'id', 'msg_' || replace(gen_random_uuid()::text, '-', ''),
    'sender', v_role,
    'name', v_sender_name,
    'text', btrim(p_message),
    'time', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
  );

  v_notes := v_notes || jsonb_build_array(v_new_msg);

  -- Cập nhật vào leave_requests
  UPDATE public.leave_requests
  SET reviewer_note = v_notes::text,
      updated_at = now()
  WHERE id = p_leave_id;

  RETURN jsonb_build_object('ok', true, 'notes', v_notes);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.submit_leave_comment(uuid, text) TO authenticated, anon;
