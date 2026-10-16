create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  mssv text not null references public.students(mssv) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_unique_pending_reset 
on public.password_reset_requests(mssv) 
where status = 'pending';

alter table public.password_reset_requests enable row level security;

drop policy if exists "Anon can insert requests" on public.password_reset_requests;
create policy "Anon can insert requests" 
on public.password_reset_requests for insert to anon
with check (
  status = 'pending' 
  and handled_at is null 
  and handled_by is null
);

drop policy if exists "Admin full access" on public.password_reset_requests;
create policy "Admin full access" 
on public.password_reset_requests for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_complete_reset_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied (Not Admin)';
  end if;

  update public.password_reset_requests
  set status = 'completed',
      handled_at = now(),
      handled_by = auth.uid()
  where id = p_request_id and status = 'pending';

  return true;
end;
$$;
