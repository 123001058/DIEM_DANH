-- =====================================================================
-- DIEM_DANH — Migration: PHÂN QUYỀN & GIAO NHIỆM VỤ
-- Chạy trong Supabase > SQL Editor (SAU khi đã chạy schema.sql).
-- Idempotent: chạy lại nhiều lần vẫn an toàn, không mất dữ liệu cũ.
--
-- Mô hình quyền:
--   admin   : 1 tài khoản duy nhất, quyền cao nhất.
--   leader  : Đội trưởng do Admin cấp quyền, quản lý nhóm/đội của mình.
--   student : Thành viên, chỉ xem & thực hiện nhiệm vụ được giao.
--
-- LƯU Ý VỀ LỊCH RẢNH:
--   Lịch học gốc nằm ở file tĩnh `lich_hoc_tong_hop.json` (phía client).
--   Bảng `availability_blocks` ở đây lưu các KHOẢNG BẬN THỦ CÔNG do
--   chính thành viên khai báo. Lịch rảnh = (không có lớp học) VÀ (không bị chặn).
-- =====================================================================

-- 1) NHÓM / ĐỘI ------------------------------------------------------------

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  leader_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.teams is 'Nhóm/đội. Mỗi nhóm có tối đa 1 đội trưởng (leader_id).';

create table if not exists public.team_members (
  team_id   uuid not null references public.teams(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx
  on public.team_members (user_id);

-- 2) NHIỆM VỤ --------------------------------------------------------------

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  title       text not null,
  description text,
  -- Khung thời gian dự kiến (dùng để đối chiếu lịch rảnh khi giao việc)
  -- Thu: 2=Thứ Hai ... 7=Thứ Bảy, 8=Chủ Nhật (đúng chuẩn file lich_hoc_tong_hop.json)
  -- Buoi: 1=Sáng, 2=Chiều, 3=Tối
  slot_thu    int check (slot_thu is null or slot_thu between 2 and 8),
  slot_buoi   int check (slot_buoi is null or slot_buoi between 1 and 3),
  due_at      timestamptz,
  priority    text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done', 'cancelled')),
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_team_idx
  on public.tasks (team_id, created_at desc);

create table if not exists public.task_assignments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done', 'cancelled')),
  note        text,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  unique (task_id, assignee_id)
);

create index if not exists task_assignments_assignee_idx
  on public.task_assignments (assignee_id, status);

-- 3) KHOẢNG BẬN THỦ CÔNG (bổ sung cho lịch học) ---------------------------

create table if not exists public.availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot_thu   int not null check (slot_thu between 2 and 8),
  slot_buoi  int not null check (slot_buoi between 1 and 3),
  reason     text,
  created_at timestamptz not null default now(),
  unique (user_id, slot_thu, slot_buoi)
);

create index if not exists availability_blocks_user_idx
  on public.availability_blocks (user_id);

-- 4) HÀM KIỂM TRA QUYỀN (security definer để tránh vòng lặp RLS) ------------

-- LƯU Ý QUAN TRỌNG VỀ RLS:
--   Bảng `tasks` và `task_assignments` tham chiếu lẫn nhau trong policy.
--   Nếu viết thẳng subquery chéo bảng, PostgreSQL sẽ báo lỗi
--   "infinite recursion detected in policy". Vì vậy các phép kiểm tra
--   chéo bảng đều được gói trong hàm SECURITY DEFINER (bypass RLS),
--   còn policy chỉ gọi hàm — tránh hoàn toàn vòng lặp.

-- Đội trưởng: role = 'leader' trong profiles
create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'leader'
  );
$$;

revoke all on function public.is_leader() from public, anon;
grant execute on function public.is_leader() to authenticated;

-- Có phải đội trưởng (hoặc admin) của nhóm này không
create or replace function public.is_team_leader(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    );
$$;

revoke all on function public.is_team_leader(uuid) from public, anon;
grant execute on function public.is_team_leader(uuid) to authenticated;

-- Có thuộc nhóm này không (bao gồm cả đội trưởng và admin)
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.is_admin()
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members
      where team_id = p_team_id and user_id = auth.uid()
    );
$$;

revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;

-- Hai người có chung một nhóm không (dùng cho chính sách đọc profiles)
create or replace function public.shares_team_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.is_admin() or exists (
    select 1
    from public.team_members me
    join public.team_members other
      on other.team_id = me.team_id
    where me.user_id = auth.uid()
      and other.user_id = p_user_id
  ) or exists (
    -- Đội trưởng xem được thành viên trong nhóm mình quản lý
    select 1
    from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.leader_id = auth.uid() and m.user_id = p_user_id
  );
$$;

revoke all on function public.shares_team_with(uuid) from public, anon;
grant execute on function public.shares_team_with(uuid) to authenticated;

-- 4b) HÀM PHÁO VÒNG LẶP RLS GIỮA tasks <-> task_assignments ----------------
-- Nếu policy của bảng này truy vấn trực tiếp bảng kia (hoặc ngược lại),
-- PostgreSQL báo "infinite recursion detected in policy".
-- Hai hàm SECURITY DEFINER dưới đây đóng vai trò trung gian, giúp policy
-- chỉ gọi hàm và không tự tham chiếu bảng.

-- Người dùng hiện tại có được giao nhiệm vụ này không?
create or replace function public.is_assigned_to_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  );
$$;

revoke all on function public.is_assigned_to_task(uuid) from public, anon;
grant execute on function public.is_assigned_to_task(uuid) to authenticated;

-- Người dùng hiện tại có quyền quản lý phần công của nhiệm vụ này không?
create or replace function public.can_manage_assignment(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id and public.is_team_leader(t.team_id)
  );
$$;

revoke all on function public.can_manage_assignment(uuid) from public, anon;
grant execute on function public.can_manage_assignment(uuid) to authenticated;

-- 5) ROW LEVEL SECURITY ----------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.availability_blocks enable row level security;

drop policy if exists teams_select on public.teams;
drop policy if exists teams_insert on public.teams;
drop policy if exists teams_update on public.teams;
drop policy if exists teams_delete on public.teams;

-- Xem: admin xem tất cả; thành viên xem nhóm của mình
create policy teams_select on public.teams
  for select to authenticated
  using (public.is_team_member(id));

-- Tạo nhóm: chỉ Admin
create policy teams_insert on public.teams
  for insert to authenticated
  with check (public.is_admin());

-- Sửa nhóm: Admin hoặc chính đội trưởng của nhóm đó
create policy teams_update on public.teams
  for update to authenticated
  using (public.is_team_leader(id))
  with check (public.is_team_leader(id));

-- Xoá nhóm: chỉ Admin
create policy teams_delete on public.teams
  for delete to authenticated
  using (public.is_admin());

drop policy if exists team_members_select on public.team_members;
drop policy if exists team_members_write on public.team_members;

create policy team_members_select on public.team_members
  for select to authenticated
  using (public.is_team_member(team_id));

-- Đổi thành viên vào/ra nhóm: Admin hoặc đội trưởng của nhóm
create policy team_members_write on public.team_members
  for all to authenticated
  using (public.is_team_leader(team_id))
  with check (public.is_team_leader(team_id));

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_write on public.tasks;

-- Đọc nhiệm vụ: đội trưởng/admin thấy hết nhóm; thành viên chỉ thấy việc được giao
-- Dùng is_assigned_to_task() (SECURITY DEFINER) để không lặp RLS với task_assignments
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.is_team_leader(team_id)
    or public.is_assigned_to_task(id)
  );

-- Tạo/sửa/xoá nhiệm vụ: chỉ Admin hoặc đội trưởng của nhóm
create policy tasks_write on public.tasks
  for all to authenticated
  using (public.is_team_leader(team_id))
  with check (public.is_team_leader(team_id));

drop policy if exists task_assignments_select on public.task_assignments;
drop policy if exists task_assignments_write on public.task_assignments;

-- Người nhận xem được phần công của mình; đội trưởng/admin xem hết nhóm
create policy task_assignments_select on public.task_assignments
  for select to authenticated
  using (
    assignee_id = auth.uid()
    or public.can_manage_assignment(task_id)
  );

-- Chỉ đội trưởng/admin mới được tạo / sửa / gỡ phân công
create policy task_assignments_write on public.task_assignments
  for all to authenticated
  using (public.can_manage_assignment(task_id))
  with check (public.can_manage_assignment(task_id));

drop policy if exists availability_blocks_select on public.availability_blocks;
drop policy if exists availability_blocks_write on public.availability_blocks;

-- Xem khoảng bận: bản thân, admin, hoặc đội trưởng nhóm chứa người đó
create policy availability_blocks_select on public.availability_blocks
  for select to authenticated
  using (user_id = auth.uid() or public.shares_team_with(user_id));

-- Ai cũng tự khai báo/xoá khoảng bận của chính mình
create policy availability_blocks_write on public.availability_blocks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 6) MỞ RỎ PROFILES CHO ĐỘI TRƯỞNG XEM THÀNH VIÊN NHÓM MÌNH ---------------

-- profiles hiện chỉ cho phép đọc chính mình + admin.
-- Thêm chính sách cho phép đồng đội trong cùng nhóm đọc tên/MSSV (cần để giao việc).
drop policy if exists profiles_read_team on public.profiles;

create policy profiles_read_team
  on public.profiles
  for select to authenticated
  using (public.shares_team_with(user_id));

-- 7) CẤP QUYỀN TABLE -------------------------------------------------------

revoke all on public.teams, public.team_members, public.tasks,
  public.task_assignments, public.availability_blocks from anon;
grant select, insert, update, delete on public.teams, public.team_members,
  public.tasks, public.task_assignments, public.availability_blocks to authenticated;

-- 8) RPC QUẢN TRỊ (CHỈ ADMIN) ---------------------------------------------

-- 8.1 Tạo nhóm mới
create or replace function public.admin_create_team(
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_team public.teams;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được tạo nhóm.');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'Tên nhóm không được để trống.');
  end if;

  insert into public.teams (name, description)
  values (v_name, nullif(btrim(coalesce(p_description, '')), ''))
  returning * into v_team;

  return jsonb_build_object('ok', true, 'team', jsonb_build_object(
    'id', v_team.id, 'name', v_team.name, 'description', v_team.description
  ));
end;
$$;

revoke all on function public.admin_create_team(text, text) from public, anon;
grant execute on function public.admin_create_team(text, text) to authenticated;

-- 8.2 Cấp quyền Đội trưởng cho một thành viên (hoặc người phụ trách)
--     Đồng thời gán người đó làm leader_id của nhóm và thành viên của nhóm.
create or replace function public.admin_set_team_leader(
  p_team_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_team public.teams;
  v_target profiles;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được cấp quyền Đội trưởng.');
  end if;

  if p_team_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Thiếu thông tin nhóm hoặc người dùng.');
  end if;

  select * into v_team from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  select * into v_target from public.profiles where user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  -- Không cho phép tự cấp quyền cho chính mình (bảo vệ tài khoản Admin duy nhất)
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', 'Không thể cấp quyền Đội trưởng cho chính tài khoản Admin.');
  end if;

  -- Bỏ quyền đội trưởng cũ (nếu có) và trả họ về thành viên
  if v_team.leader_id is not null and v_team.leader_id <> p_user_id then
    update public.profiles
    set role = 'student'
    where user_id = v_team.leader_id and role = 'leader';
  end if;

  update public.teams
  set leader_id = p_user_id
  where id = p_team_id;

  -- Nâng quyền tài khoản được cấp
  update public.profiles
  set role = 'leader'
  where user_id = p_user_id and role <> 'admin';

  -- Đảm bảo đội trưởng cũng là thành viên của nhóm
  insert into public.team_members (team_id, user_id)
  values (p_team_id, p_user_id)
  on conflict (team_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội trưởng thành công.');
end;
$$;

revoke all on function public.admin_set_team_leader(uuid, uuid) from public, anon;
grant execute on function public.admin_set_team_leader(uuid, uuid) to authenticated;

-- 8.3 Thêm / gỡ thành viên khỏi nhóm (Admin hoặc đội trưởng của nhóm)
create or replace function public.team_add_member(
  p_team_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được thêm thành viên.');
  end if;

  if not exists (select 1 from public.teams where id = p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy hồ sơ người dùng.');
  end if;

  -- Một tài khoản chỉ thuộc một nhóm
  if exists (select 1 from public.team_members where user_id = p_user_id and team_id <> p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Người dùng này đã thuộc một nhóm khác.');
  end if;

  insert into public.team_members (team_id, user_id)
  values (p_team_id, p_user_id)
  on conflict (team_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'message', 'Đã thêm thành viên vào nhóm.');
end;
$$;

revoke all on function public.team_add_member(uuid, uuid) from public, anon;
grant execute on function public.team_add_member(uuid, uuid) to authenticated;

create or replace function public.team_remove_member(
  p_team_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được gỡ thành viên.');
  end if;

  -- Không cho gỡ chính đội trưởng (phải chuyển quyền trước)
  if exists (select 1 from public.teams where id = p_team_id and leader_id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'Không thể gỡ Đội trưởng. Hãy cấp lại Đội trưởng trước.');
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'message', 'Đã gỡ thành viên khỏi nhóm.');
end;
$$;

revoke all on function public.team_remove_member(uuid, uuid) from public, anon;
grant execute on function public.team_remove_member(uuid, uuid) to authenticated;

-- 8.4 Thu hồi quyền Đội trưởng (trả về thành viên thường)
create or replace function public.admin_revoke_leader(p_team_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_old uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được thu hồi quyền Đội trưởng.');
  end if;

  select leader_id into v_old from public.teams where id = p_team_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhóm.');
  end if;

  if v_old is null then
    return jsonb_build_object('ok', false, 'message', 'Nhóm này chưa có Đội trưởng.');
  end if;

  update public.teams set leader_id = null where id = p_team_id;
  update public.profiles set role = 'student' where user_id = v_old and role = 'leader';

  return jsonb_build_object('ok', true, 'message', 'Đã thu hồi quyền Đội trưởng.');
end;
$$;

revoke all on function public.admin_revoke_leader(uuid) from public, anon;
grant execute on function public.admin_revoke_leader(uuid) to authenticated;

-- 8.5 Danh sách tài khoản (Admin dùng để cấp quyền / thêm vào nhóm)
create or replace function public.admin_list_users()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được xem danh sách tài khoản.');
  end if;

  return jsonb_build_object('ok', true, 'users', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'full_name', p.full_name,
        'mssv', p.mssv,
        'role', p.role,
        'team_id', tm.team_id,
        'team_name', t.name
      ) order by p.role, coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.profiles p
    left join public.team_members tm on tm.user_id = p.user_id
    left join public.teams t on t.id = tm.team_id
  ));
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- 9) RPC NHIỆM VỤ ----------------------------------------------------------

-- 9.1 Đội trưởng tạo nhiệm vụ trong nhóm mình
create or replace function public.leader_create_task(
  p_team_id uuid,
  p_title text,
  p_description text default null,
  p_slot_thu int default null,
  p_slot_buoi int default null,
  p_due_at timestamptz default null,
  p_priority text default 'normal'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_task public.tasks;
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng của nhóm mới được tạo nhiệm vụ.');
  end if;

  if v_title = '' then
    return jsonb_build_object('ok', false, 'message', 'Tiêu đề nhiệm vụ không được để trống.');
  end if;

  if p_slot_thu is not null and (p_slot_thu < 2 or p_slot_thu > 8) then
    return jsonb_build_object('ok', false, 'message', 'Thứ không hợp lệ (2–8).');
  end if;

  if p_slot_buoi is not null and (p_slot_buoi < 1 or p_slot_buoi > 3) then
    return jsonb_build_object('ok', false, 'message', 'Buổi không hợp lệ (1–3).');
  end if;

  if p_priority is null or p_priority not in ('low', 'normal', 'high') then
    p_priority := 'normal';
  end if;

  insert into public.tasks (
    team_id, title, description, slot_thu, slot_buoi, due_at, priority, created_by
  )
  values (
    p_team_id, v_title, nullif(btrim(coalesce(p_description, '')), ''),
    p_slot_thu, p_slot_buoi, p_due_at, p_priority, auth.uid()
  )
  returning * into v_task;

  return jsonb_build_object('ok', true, 'task', jsonb_build_object(
    'id', v_task.id, 'title', v_task.title, 'team_id', v_task.team_id
  ));
end;
$$;

revoke all on function public.leader_create_task(uuid, text, text, int, int, timestamptz, text)
  from public, anon;
grant execute on function public.leader_create_task(uuid, text, text, int, int, timestamptz, text)
  to authenticated;

-- 9.2 Giao nhiệm vụ cho thành viên trong nhóm.
--     Có kiểm tra lịch rảnh: nếu thành viên BẬN (đã khai báo bận trong DB)
--     đúng khung giờ thì từ chối, trừ khi p_force = true.
--     (Lịch học từ lich_hoc_tong_hop.json được kiểm tra thêm ở tầng giao diện.)
create or replace function public.leader_assign_task(
  p_task_id uuid,
  p_assignee_id uuid,
  p_note text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_task public.tasks;
  v_block record;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được giao nhiệm vụ.');
  end if;

  -- Thành viên phải thuộc đúng nhóm đó
  if not exists (
    select 1 from public.team_members
    where team_id = v_task.team_id and user_id = p_assignee_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'Người được giao không thuộc nhóm này.');
  end if;

  -- Kiểm tra lịch rảnh (khoảng bận thủ công)
  if v_task.slot_thu is not null and v_task.slot_buoi is not null and not coalesce(p_force, false) then
    select * into v_block
    from public.availability_blocks
    where user_id = p_assignee_id
      and slot_thu = v_task.slot_thu
      and slot_buoi = v_task.slot_buoi;

    if found then
      return jsonb_build_object(
        'ok', false,
        'message', 'Thành viên đã báo bận trong khung giờ này. Hãy chọn người khác hoặc giao cưỡng chế.',
        'conflict', true
      );
    end if;
  end if;

  insert into public.task_assignments (task_id, assignee_id, note, assigned_by)
  values (p_task_id, p_assignee_id, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (task_id, assignee_id) do update
    set note = excluded.note, assigned_at = now(), assigned_by = auth.uid();

  return jsonb_build_object('ok', true, 'message', 'Đã giao nhiệm vụ thành công.');
end;
$$;

revoke all on function public.leader_assign_task(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.leader_assign_task(uuid, uuid, text, boolean) to authenticated;

-- 9.3 Gỡ phân công (Đội trưởng nhóm đó)
create or replace function public.leader_unassign_task(
  p_task_id uuid,
  p_assignee_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Không tìm thấy nhiệm vụ.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được gỡ nhiệm vụ.');
  end if;

  delete from public.task_assignments
  where task_id = p_task_id and assignee_id = p_assignee_id;

  return jsonb_build_object('ok', true, 'message', 'Đã gỡ nhiệm vụ khỏi thành viên.');
end;
$$;

revoke all on function public.leader_unassign_task(uuid, uuid) from public, anon;
grant execute on function public.leader_unassign_task(uuid, uuid) to authenticated;

-- 9.4 Xoá nhiệm vụ (Đội trưởng nhóm đó)
create or replace function public.leader_delete_task(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return jsonb_build_object('ok', true, 'message', 'Nhiệm vụ không tồn tại.');
  end if;

  if not public.is_team_leader(v_task.team_id) then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin hoặc Đội trưởng mới được xoá nhiệm vụ.');
  end if;

  delete from public.tasks where id = p_task_id;
  return jsonb_build_object('ok', true, 'message', 'Đã xoá nhiệm vụ.');
end;
$$;

revoke all on function public.leader_delete_task(uuid) from public, anon;
grant execute on function public.leader_delete_task(uuid) to authenticated;

-- 9.5 Thành viên cập nhật tiến độ nhiệm vụ của CHÍNH MÌNH
create or replace function public.update_task_status(
  p_task_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_status is null or p_status not in ('todo', 'doing', 'done', 'cancelled') then
    return jsonb_build_object('ok', false, 'message', 'Trạng thái không hợp lệ.');
  end if;

  -- Chỉ được cập nhật nhiệm vụ được giao cho mình (đội trưởng/admin thì đã có quyền ở trên)
  if not exists (
    select 1 from public.task_assignments
    where task_id = p_task_id and assignee_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không được giao nhiệm vụ này.');
  end if;

  update public.task_assignments
  set status = p_status,
      note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note)
  where task_id = p_task_id and assignee_id = auth.uid();

  return jsonb_build_object('ok', true, 'message', 'Đã cập nhật tiến độ.');
end;
$$;

revoke all on function public.update_task_status(uuid, text, text) from public, anon;
grant execute on function public.update_task_status(uuid, text, text) to authenticated;

-- 10) RPC LỊCH RẢNH -------------------------------------------------------

-- 10.1 Thành viên tự khai báo / gỡ khoảng bận của chính mình
create or replace function public.set_availability_block(
  p_slot_thu int,
  p_slot_buoi int,
  p_busy boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_slot_thu is null or p_slot_thu < 2 or p_slot_thu > 8 then
    return jsonb_build_object('ok', false, 'message', 'Thứ không hợp lệ (2–8).');
  end if;

  if p_slot_buoi is null or p_slot_buoi < 1 or p_slot_buoi > 3 then
    return jsonb_build_object('ok', false, 'message', 'Buổi không hợp lệ (1–3).');
  end if;

  if coalesce(p_busy, false) then
    insert into public.availability_blocks (user_id, slot_thu, slot_buoi, reason)
    values (auth.uid(), p_slot_thu, p_slot_buoi, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (user_id, slot_thu, slot_buoi)
    do update set reason = excluded.reason, created_at = now();
  else
    delete from public.availability_blocks
    where user_id = auth.uid()
      and slot_thu = p_slot_thu
      and slot_buoi = p_slot_buoi;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Đã cập nhật lịch rảnh.');
end;
$$;

revoke all on function public.set_availability_block(int, int, boolean, text) from public, anon;
grant execute on function public.set_availability_block(int, int, boolean, text) to authenticated;

-- 10.2 Bảng lịch rảnh của các thành viên trong nhóm (Đội trưởng dùng để giao việc).
--      Trả về mảng jsonb: user_id, full_name, mssv, và các khoảng đã báo bận.
create or replace function public.get_team_availability(p_team_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object('ok', true, 'members', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'full_name', coalesce(p.full_name, p.username),
        'mssv', p.mssv,
        'is_leader', (t.leader_id = p.user_id),
        'blocks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'thu', ab.slot_thu,
            'buoi', ab.slot_buoi,
            'reason', ab.reason
          ) order by ab.slot_thu, ab.slot_buoi)
          from public.availability_blocks ab
          where ab.user_id = p.user_id
        ), '[]'::jsonb)
      ) order by p.full_name
    ), '[]'::jsonb)
    from public.profiles p
    left join public.team_members tm on tm.user_id = p.user_id and tm.team_id = p_team_id
    left join public.teams t on t.id = p_team_id
    where tm.team_id is not null or t.leader_id = p.user_id
  ));
end;
$$;

revoke all on function public.get_team_availability(uuid) from public, anon;
grant execute on function public.get_team_availability(uuid) to authenticated;

-- 10.3 Danh sách nhiệm vụ của nhóm (Đội trưởng xem tất cả, thành viên chỉ thấy việc mình)
create or replace function public.get_team_board(p_team_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'is_leader', public.is_team_leader(p_team_id),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'description', t.description,
          'slot_thu', t.slot_thu,
          'slot_buoi', t.slot_buoi,
          'due_at', t.due_at,
          'priority', t.priority,
          'status', t.status,
          'created_at', t.created_at,
          'assignees', coalesce((
            select jsonb_agg(jsonb_build_object(
              'user_id', a.assignee_id,
              'full_name', coalesce(p.full_name, p.username),
              'status', a.status,
              'note', a.note
            ))
            from public.task_assignments a
            left join public.profiles p on p.user_id = a.assignee_id
            where a.task_id = t.id
          ), '[]'::jsonb)
        ) order by t.created_at desc
      ), '[]'::jsonb)
      from public.tasks t
      where t.team_id = p_team_id
        and (
          public.is_team_leader(p_team_id)
          or exists (
            select 1 from public.task_assignments a
            where a.task_id = t.id and a.assignee_id = auth.uid()
          )
        )
    )
  );
end;
$$;

revoke all on function public.get_team_board(uuid) from public, anon;
grant execute on function public.get_team_board(uuid) to authenticated;

-- 10.4 Nhóm của tôi (dùng để điều hướng sau khi đăng nhập)
create or replace function public.my_teams()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if public.is_admin() then
    return jsonb_build_object('ok', true, 'is_admin', true, 'teams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'leader_id', t.leader_id
      ) order by t.name), '[]'::jsonb)
      from public.teams t
    ));
  end if;

  return jsonb_build_object('ok', true, 'is_admin', false, 'teams', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'leader_id', t.leader_id
    ) order by t.name), '[]'::jsonb)
    from public.teams t
    where public.is_team_member(t.id)
  ));
end;
$$;

revoke all on function public.my_teams() from public, anon;
grant execute on function public.my_teams() to authenticated;

-- =====================================================================
-- Xong. Sau khi chạy file này, hãy refresh lại schema cache của Supabase.
-- =====================================================================
