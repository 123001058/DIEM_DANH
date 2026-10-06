-- =====================================================================
-- DIEM_DANH — Migration v2: VAI TRÒ ĐỘI PHÓ (DEPUTY)
--
-- Chạy SAU schema_roles.sql. Idempotent — chạy lại nhiều lần vẫn an toàn.
--
-- Thay đổi so với v1:
--   • Thêm role 'deputy' vào profiles.role
--   • Thêm cột team_members.team_role ('leader' | 'deputy' | 'member')
--   • Deputy có quyền ngang Leader: xem lịch rảnh, tạo & giao nhiệm vụ
--   • Leader tự cấp Deputy trong nhóm mình (không cần Admin)
--   • Chỉ Admin mới cấp/thu hồi Leader chính
-- =====================================================================


-- ── A. Thêm role 'deputy' vào bảng profiles ─────────────────────────
-- Xóa constraint cũ (chỉ có admin/leader/student), tạo lại với deputy.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname  = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'leader', 'deputy', 'student'));


-- ── B. Thêm cột team_role vào team_members ───────────────────────────
-- Phân biệt vai trò BÊN TRONG nhóm: leader / deputy / member.

alter table public.team_members
  add column if not exists team_role text not null default 'member'
  check (team_role in ('leader', 'deputy', 'member'));

-- Đồng bộ: các leader hiện có → team_role = 'leader'
update public.team_members tm
set    team_role = 'leader'
from   public.teams t
where  t.id        = tm.team_id
  and  t.leader_id = tm.user_id
  and  tm.team_role = 'member';


-- ── C. Mở rộng is_leader() ───────────────────────────────────────────
-- Deputy cũng được coi là "leader" cho mục đích kiểm tra quyền chung.

create or replace function public.is_leader()
returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role in ('leader', 'deputy')
  );
$$;

revoke all   on function public.is_leader() from public, anon;
grant execute on function public.is_leader() to authenticated;


-- ── D. Mở rộng is_team_leader() ─────────────────────────────────────
-- Deputy của nhóm = quyền ngang leader trong nhóm đó.

create or replace function public.is_team_leader(p_team_id uuid)
returns boolean
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select public.is_admin()
    -- Đội trưởng chính (ghi ở teams.leader_id)
    or exists (
      select 1 from public.teams
      where id = p_team_id and leader_id = auth.uid()
    )
    -- Đội phó của nhóm này
    or exists (
      select 1 from public.team_members
      where team_id   = p_team_id
        and user_id   = auth.uid()
        and team_role = 'deputy'
    );
$$;

revoke all   on function public.is_team_leader(uuid) from public, anon;
grant execute on function public.is_team_leader(uuid) to authenticated;


-- ── E. is_team_member() — giữ nguyên logic ───────────────────────────
-- Deputy đã là thành viên nên không cần đổi gì, nhưng replace để chắc.

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer
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

revoke all   on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;


-- ── F. admin_list_users() — thêm team_role vào kết quả ──────────────

create or replace function public.admin_list_users()
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được xem danh sách tài khoản.');
  end if;

  return jsonb_build_object('ok', true, 'users', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',   p.user_id,
        'username',  p.username,
        'full_name', p.full_name,
        'mssv',      p.mssv,
        'role',      p.role,
        'team_id',   tm.team_id,
        'team_name', t.name,
        'team_role', coalesce(tm.team_role, 'member')
      ) order by p.role, coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.profiles p
    left join public.team_members tm on tm.user_id = p.user_id
    left join public.teams        t  on t.id = tm.team_id
  ));
end;
$$;

revoke all   on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;


-- ── G. leader_set_member_role() — RPC cấp quyền nội bộ nhóm ─────────
-- Leader / Deputy gọi để cấp deputy hoặc hạ về member.
-- Chỉ Admin mới cấp được 'leader' chính.

create or replace function public.leader_set_member_role(
  p_team_id  uuid,
  p_user_id  uuid,
  p_new_role text    -- 'leader' | 'deputy' | 'member'
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_team public.teams;
begin
  if not public.is_team_leader(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không có quyền phân vai trong nhóm này.');
  end if;

  if p_new_role not in ('leader', 'deputy', 'member') then
    return jsonb_build_object('ok', false, 'message', 'Vai trò không hợp lệ.');
  end if;

  if p_user_id = auth.uid() and not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Không thể thay đổi vai trò của chính mình.');
  end if;

  if not exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'Người dùng này không thuộc nhóm.');
  end if;

  select * into v_team from public.teams where id = p_team_id;

  -- Cấp Leader chính (chỉ Admin)
  if p_new_role = 'leader' then
    if not public.is_admin() then
      return jsonb_build_object('ok', false, 'message', 'Chỉ Admin mới được cấp Đội trưởng chính.');
    end if;

    if v_team.leader_id is not null and v_team.leader_id <> p_user_id then
      update public.team_members
      set    team_role = 'member'
      where  team_id = p_team_id and user_id = v_team.leader_id;

      update public.profiles
      set    role = 'student'
      where  user_id = v_team.leader_id and role = 'leader';
    end if;

    update public.teams       set leader_id = p_user_id  where id       = p_team_id;
    update public.profiles    set role      = 'leader'   where user_id  = p_user_id and role <> 'admin';
    update public.team_members set team_role = 'leader'  where team_id  = p_team_id and user_id = p_user_id;

    return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội trưởng chính.');
  end if;

  -- Cấp Deputy (Leader tự làm được)
  if p_new_role = 'deputy' then
    update public.team_members set team_role = 'deputy'  where team_id = p_team_id and user_id = p_user_id;
    update public.profiles     set role      = 'deputy'  where user_id = p_user_id and role not in ('admin', 'leader');
    return jsonb_build_object('ok', true, 'message', 'Đã cấp quyền Đội phó.');
  end if;

  -- Hạ về Member
  update public.team_members set team_role = 'member'  where team_id = p_team_id and user_id = p_user_id;
  update public.profiles     set role      = 'student' where user_id = p_user_id and role = 'deputy';

  return jsonb_build_object('ok', true, 'message', 'Đã đặt lại thành Thành viên.');
end;
$$;

revoke all   on function public.leader_set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.leader_set_member_role(uuid, uuid, text) to authenticated;


-- ── H. get_team_availability() — thêm team_role & is_deputy ─────────
-- Ghi đè hàm cũ, sắp xếp: leader → deputy → member.

create or replace function public.get_team_availability(p_team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.is_team_member(p_team_id) then
    return jsonb_build_object('ok', false, 'message', 'Bạn không thuộc nhóm này.');
  end if;

  return jsonb_build_object('ok', true, 'members', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',   p.user_id,
        'username',  p.username,
        'full_name', coalesce(p.full_name, p.username),
        'mssv',      p.mssv,
        'role',      p.role,
        'team_role', tm.team_role,
        'is_leader', (t.leader_id = p.user_id),
        'is_deputy', (tm.team_role = 'deputy'),
        'blocks', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'slot_thu',  ab.slot_thu,
            'slot_buoi', ab.slot_buoi,
            'reason',    ab.reason
          )), '[]'::jsonb)
          from public.availability_blocks ab
          where ab.user_id = p.user_id
        )
      ) order by
        case tm.team_role
          when 'leader' then 1
          when 'deputy' then 2
          else 3
        end,
        coalesce(p.full_name, p.username)
    ), '[]'::jsonb)
    from public.team_members tm
    join public.profiles p on p.user_id = tm.user_id
    join public.teams    t on t.id      = tm.team_id
    where tm.team_id = p_team_id
  ));
end;
$$;

revoke all   on function public.get_team_availability(uuid) from public, anon;
grant execute on function public.get_team_availability(uuid) to authenticated;


-- =====================================================================
-- Xong. Refresh schema cache trong Supabase sau khi chạy file này.
-- Thứ tự chạy: schema.sql → schema_roles.sql → schema_roles_v2.sql
-- =====================================================================
