-- =====================================================================
-- BẢNG LƯU TRỮ DỮ LIỆU KHUÔN MẶT SINH VIÊN (5 góc chụp)
-- Mỗi sinh viên: mssv, mảng 5 vector descriptors, 5 ảnh thumbnail nhỏ.
-- =====================================================================
create table if not exists public.student_face_data (
  mssv text not null references public.students(mssv) on delete cascade,
  descriptors jsonb not null default '[]'::jsonb,
  thumbnails jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default now() not null,
  constraint student_face_data_pkey primary key (mssv)
);

-- Cấp quyền thao tác bảng cho role authenticated
grant select, insert, update, delete on table public.student_face_data to authenticated;

alter table public.student_face_data enable row level security;

-- 1. ĐỌC: Admin hoặc chính chủ (qua profiles.mssv của auth.uid())
drop policy if exists "student_face_data_select" on public.student_face_data;
create policy "student_face_data_select" on public.student_face_data
  for select to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

-- 2. GHI (INSERT/UPDATE): Admin hoặc chính chủ
drop policy if exists "student_face_data_upsert" on public.student_face_data;
create policy "student_face_data_upsert" on public.student_face_data
  for all to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

-- 3. XÓA: Admin hoặc chính chủ
drop policy if exists "student_face_data_delete" on public.student_face_data;
create policy "student_face_data_delete" on public.student_face_data
  for delete to authenticated
  using (
    public.is_admin()
    or mssv = (select p.mssv from public.profiles p where p.user_id = auth.uid())
  );

-- Comment tài liệu
comment on table public.student_face_data is 'Lưu dữ liệu khuôn mặt 5 góc của sinh viên: descriptors (5 vector 128D), thumbnails (5 ảnh 100x100), dùng cho nhận diện ESP32/Camera và sinh viên xóa làm lại từ đầu.';
