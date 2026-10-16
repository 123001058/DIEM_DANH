-- =====================================================================
-- Migration: 20261016160000_seed_30_students_and_avatars.sql
-- Description: Bo sung cot avatar, class, phone va seed 30 sinh vien tu Word LH-NaviX
-- =====================================================================

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students_read_all" ON public.students;
CREATE POLICY "students_read_all" ON public.students FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "students_write_all" ON public.students;
CREATE POLICY "students_write_all" ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO authenticated, service_role;

INSERT INTO public.students (mssv, name, class, phone, avatar, is_active)
VALUES
  ('123000651', 'Cao Thanh Nghĩa', '23OT112', '0889258633', 'images/faces/123000651.png', true),
  ('123000722', 'Bùi Trần Thanh Sang', '23OT112', '0988039416', 'images/faces/123000722.png', true),
  ('123000432', 'Trần Thành Long', '23TD111', '0799698594', 'images/faces/123000432.png', true),
  ('12300555', 'Nguyễn Lê Vũ Duy', '23TD111', '0888189218', 'images/faces/12300555.png', true),
  ('123000185', 'Lê Văn Minh', '23TD111', '0988878095', 'images/faces/123000185.png', true),
  ('123001188', 'Phạm Anh Tuấn', '23TD111', '0334869213', 'images/faces/123001188.png', true),
  ('123000375', 'Phạm Đinh Tài Lộc', '23TD111', '0784728289', 'images/faces/123000375.png', true),
  ('123001394', 'Đỗ Văn Quyền', '23TD111', '0943007300', 'images/faces/123001394.png', true),
  ('123001058', 'Nguyễn Khánh Hòa', '23TD111', '0327714104', 'images/faces/123001058.png', true),
  ('123000872', 'Nguyễn Đình Hậu', '23TD111', '0363009846', 'images/faces/123000872.png', true),
  ('125000890', 'Lê Ngô Gia Bảo', '25OT112', '0845314234', 'images/faces/125000890.png', true),
  ('123000078', 'Trần Hải Nam', '23TD111', '0372767101', 'images/faces/123000078.png', true),
  ('124001589', 'Nguyễn Hồng Hiệp', '24CD111', '0859892579', 'images/faces/124001589.png', true),
  ('124000534', 'Nguyễn Ngọc Bình An', '24CD111', '0868449373', 'images/faces/124000534.png', true),
  ('124000354', 'Phan Công Thịnh', '24TD111', '0327459215', 'images/faces/124000354.jpeg', true),
  ('124000737', 'Phạm Tuấn Phát', '24OT112', '0333649910', 'images/faces/124000737.png', true),
  ('124001851', 'Nguyễn Thị Thùy', '24AI111', '0837665752', 'images/faces/124001851.png', true),
  ('124001238', 'Nguyễn Đức Huy', '24CD111', '0813766418', 'images/faces/124001238.png', true),
  ('125001087', 'Cao Anh Tú', '25OT112', '0378740764', 'images/faces/125001087.png', true),
  ('125002381', 'Cao Thế Phi', '25OT112', '081305623', 'images/faces/125002381.png', true),
  ('125001343', 'Dương Công Mạnh', '25OT112', '', 'images/faces/125001343.png', true),
  ('125000798', 'Nguyễn Minh Khang', '25CK111', '0336152365', 'images/faces/125000798.png', true),
  ('125000550', 'Nguyễn Duy Tiến', '25CK111', '0798584673', 'images/faces/125000550.png', true),
  ('125001579', 'Nguyễn Thiện Nhân', '25CK111', '0359583253', 'images/faces/125001579.png', true),
  ('125001809', 'Nguyễn Thanh Thái', '25CK111', '0389562809', 'images/faces/125001809.png', true),
  ('125001875', 'Nguyễn Hoàng Phi Hùng', '25CK111', '0988270632', 'images/faces/125001875.png', true),
  ('125000568', 'Phan Quốc Bảo', '25CK111', '0986994012', 'images/faces/125000568.png', true),
  ('125000372', 'Nguyễn Huỳnh Minh Thông', '25TD112', '0926079067', 'images/faces/125000372.png', true),
  ('125001648', 'Nguyễn Thanh Tiến', '25TD112', '0964865031', 'images/faces/125001648.png', true),
  ('122000426', 'Nguyễn Văn Hậu', '22CT113', '', '', true)
ON CONFLICT (mssv) DO UPDATE SET
  name = EXCLUDED.name,
  class = EXCLUDED.class,
  phone = EXCLUDED.phone,
  avatar = EXCLUDED.avatar,
  is_active = EXCLUDED.is_active;
