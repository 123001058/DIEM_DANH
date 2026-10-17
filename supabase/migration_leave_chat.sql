-- =====================================================================
-- Migration: Hỗ trợ Chat Trao đổi / Phản hồi 2 chiều trên Đơn xin nghỉ phép
-- Tự động vượt qua RLS an toàn để sinh viên và admin đều nhắn tin được
-- =====================================================================

CREATE OR REPLACE FUNCTION public.submit_leave_comment(
  p_leave_id uuid,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
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
  IF v_current_user <> v_req.requested_by AND NOT v_is_admin_user THEN
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
          'time', to_char(coalesce(v_req.reviewed_at, v_req.updated_at), 'HH24:MI DD/MM')
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
        'time', to_char(coalesce(v_req.reviewed_at, v_req.updated_at), 'HH24:MI DD/MM')
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

  -- Bắn thông báo chuông (in_app_notifications) cho phía bên kia
  IF v_is_admin_user THEN
    INSERT INTO public.in_app_notifications(user_id, title, message, leave_request_id)
    VALUES (v_req.requested_by, 'Quản lý đã phản hồi đơn nghỉ', btrim(p_message), p_leave_id);
  ELSE
    INSERT INTO public.in_app_notifications(user_id, title, message, leave_request_id)
    SELECT p.user_id, 'Phản hồi mới về đơn xin nghỉ', v_sender_name || ' (' || v_req.mssv || '): ' || btrim(p_message), p_leave_id
    FROM public.profiles p JOIN public.admin_mssv a ON a.mssv = p.mssv;
  END IF;

  RETURN jsonb_build_object('ok', true, 'notes', v_notes);
END;
$$;
