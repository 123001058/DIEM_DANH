-- Chuan hoa duong dan avatar cho cac sinh vien co file JPEG tren web
-- CHI CAP NHAT cac sinh vien dang dung anh mac dinh 'images/faces/%.png' hoac chua co avatar
-- TUYET DOI GIU NGUYEN cac avatar tuy chinh / anh sinh vien tu tai len (URL Supabase Storage https://...)
UPDATE public.students
SET avatar = 'images/faces/' || mssv || '.jpg'
WHERE mssv IN (
  '123000078', '123000185', '123000432', '123000651', '123000722',
  '123000872', '123001058', '123001394', '124000354', '124001238',
  '124001851', '125000568', '125000798', '125001343', '125001875',
  '125002381'
)
AND (
  avatar IS NULL 
  OR avatar = '' 
  OR avatar LIKE 'images/faces/%.png'
  OR avatar LIKE 'images/faces/%.jpg'
);

GRANT SELECT (mssv, name, avatar) ON public.students TO anon, authenticated;
