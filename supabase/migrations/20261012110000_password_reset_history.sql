create table if not exists public.password_reset_history (
  id uuid primary key default gen_random_uuid(),
  mssv text not null,
  student_name text not null,
  reset_by uuid references auth.users(id) on delete set null,
  reset_by_name text not null default 'Admin',
  request_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_history_created_at
  on public.password_reset_history (created_at desc);

alter table public.password_reset_history enable row level security;
drop policy if exists admin_read_password_reset_history on public.password_reset_history;
create policy admin_read_password_reset_history on public.password_reset_history
  for select to authenticated using (public.is_admin());
grant select on public.password_reset_history to authenticated;

create or replace function public.admin_clear_password_reset_history()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không có quyền.');
  end if;
  delete from public.password_reset_history;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.admin_clear_password_reset_history() from public, anon;
grant execute on function public.admin_clear_password_reset_history() to authenticated;
