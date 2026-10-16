-- Cho admin tạo đơn xin nghỉ hộ sinh viên bất kỳ (policy leave_requests_submit cũ chỉ cho đúng MSSV của chính người nộp).
-- Policy INSERT được OR với nhau nên không ảnh hưởng luồng sinh viên tự nộp.
drop policy if exists "leave_requests_admin_submit" on public.leave_requests;
create policy "leave_requests_admin_submit" on public.leave_requests
  for insert
  to authenticated
  with check (is_admin() AND requested_by = auth.uid());
