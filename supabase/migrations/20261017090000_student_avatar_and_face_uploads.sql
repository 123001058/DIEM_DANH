-- =====================================================================
-- Migration: student_avatar_and_face_uploads
-- 1. Bucket Storage 'avatars' (public) cho phép sinh viên tự đổi ảnh đại diện.
-- 2. RPC student_set_my_avatar: sinh viên cập nhật avatar của chính mình.
-- 3. RPC admin_export_face_data: admin xuất toàn bộ descriptor/ảnh khuôn mặt
--    để huấn luyện nhận diện (ESP32-S3-CAM / face-kiosk).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BUCKET 'avatars' (public read, giới hạn 3MB, chỉ JPG/PNG/WebP)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Đọc công khai (ảnh đại diện hiển thị ở mọi trang)
drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Ghi: sinh viên chỉ được ghi vào thư mục mang MSSV của mình, admin ghi tất cả.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select p.mssv from public.profiles p where p.user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 2. RPC: sinh viên tự cập nhật avatar của chính mình
-- ---------------------------------------------------------------------
create or replace function public.student_set_my_avatar(p_avatar text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_mssv text;
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  select p.mssv into v_mssv from public.profiles p where p.user_id = auth.uid();
  if v_mssv is null or v_mssv = '' then
    return jsonb_build_object('ok', false, 'message', 'Tài khoản chưa liên kết MSSV. Vui lòng liên hệ Admin.');
  end if;

  -- Chỉ chấp nhận URL http(s) hoặc đường dẫn tĩnh nội bộ, tránh chèn javascript:
  if v_avatar is not null and v_avatar !~* '^(https?://|images/|/)' then
    return jsonb_build_object('ok', false, 'message', 'Đường dẫn ảnh không hợp lệ.');
  end if;

  update public.students set avatar = v_avatar where mssv = v_mssv;
  return jsonb_build_object('ok', true, 'avatar', v_avatar);
end;
$function$;

grant execute on function public.student_set_my_avatar(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. RPC: admin xuất toàn bộ dữ liệu khuôn mặt (train)
-- ---------------------------------------------------------------------
create or replace function public.admin_export_face_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ quản trị viên được phép xuất dữ liệu.');
  end if;

  select jsonb_build_object(
    'ok', true,
    'exported_at', now(),
    'count', count(*),
    'students', coalesce(jsonb_agg(jsonb_build_object(
      'mssv', s.mssv,
      'name', s.name,
      'class', s.class,
      'avatar', s.avatar,
      'updated_at', f.updated_at,
      'descriptors', coalesce(f.descriptors, '[]'::jsonb),
      'thumbnails', coalesce(f.thumbnails, '[]'::jsonb)
    ) order by s.mssv), '[]'::jsonb)
  )
  into v_result
  from public.student_face_data f
  join public.students s on s.mssv = f.mssv
  where (f.descriptors is not null and jsonb_array_length(f.descriptors) > 0)
     or (f.thumbnails is not null and jsonb_array_length(f.thumbnails) > 0);

  return v_result;
end;
$function$;

grant execute on function public.admin_export_face_data() to authenticated;

comment on function public.student_set_my_avatar(text) is 'Sinh viên tự đổi ảnh đại diện (avatar) của chính mình dựa trên auth.uid().';
comment on function public.admin_export_face_data() is 'Admin xuất toàn bộ descriptor + thumbnail khuôn mặt để huấn luyện nhận diện ngoài hệ thống.';
