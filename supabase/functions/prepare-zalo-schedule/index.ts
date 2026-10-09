import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";

const timeZone = "Asia/Ho_Chi_Minh";
const periodSpecs = [
  { key: "morning", label: "SÁNG", from: "05:00", to: "11:59", start: "05:00", end: "12:00" },
  { key: "afternoon", label: "CHIỀU", from: "12:00", to: "17:59", start: "12:00", end: "18:00" },
  { key: "evening", label: "TỐI", from: "18:00", to: "23:59", start: "18:00", end: "00:00" },
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function vietnamDateKey(date = new Date(), dayOffset = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day") + dayOffset))
    .toISOString().slice(0, 10);
}

function isoAtVietnamTime(dateKey: string, time: string) {
  const day = time === "00:00" ? new Date(`${dateKey}T12:00:00+07:00`) : null;
  const base = day ? vietnamDateKey(day, 1) : dateKey;
  return new Date(`${base}T${time}:00+07:00`).getTime();
}

function normalizeMeDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("ME trả về giờ học không hợp lệ.");
  let result = value.trim().replace(" ", "T");
  const shortOffset = result.match(/([+-]\d{2})$/);
  if (shortOffset) result += ":00";
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(result)) result += "+07:00";
  if (Number.isNaN(Date.parse(result))) throw new Error("ME trả về thời gian không đọc được.");
  return result;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("vi-VN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildPeriods(dateKey: string, members: Array<{ mssv: string; name: string }>, schedules: any[]) {
  return Object.fromEntries(periodSpecs.map((period) => {
    const start = isoAtVietnamTime(dateKey, period.start);
    const end = isoAtVietnamTime(dateKey, period.end);
    const free: Array<{ mssv: string; name: string }> = [];
    const busy: Array<{ mssv: string; name: string; classes: any[] }> = [];

    for (const member of members) {
      const classes = schedules
        .filter((item) => item.mssv === member.mssv)
        .filter((item) => Date.parse(item.start_time) < end && Date.parse(item.end_time) > start)
        .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
        .map((item) => ({
          subject: item.subject_name || "Môn học",
          room: item.room_name || "",
          start_time: item.start_time,
          end_time: item.end_time,
          time_range: `${formatTime(item.start_time)}–${formatTime(item.end_time)}`,
        }));
      if (classes.length) busy.push({ ...member, classes });
      else free.push(member);
    }

    return [period.key, {
      key: period.key,
      label: period.label,
      from: period.from,
      to: period.to,
      free_count: free.length,
      busy_count: busy.length,
      free,
      busy,
    }];
  }));
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, message: "Server chưa được cấu hình Supabase." }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: secretRow, error: secretError } = await admin
    .from("zalo_schedule_job_secret")
    .select("secret")
    .eq("id", true)
    .maybeSingle();
  const receivedSecret = req.headers.get("x-cron-secret") || "";
  if (secretError || !secretRow?.secret || receivedSecret !== secretRow.secret) {
    return json({ ok: false, message: "Unauthorized." }, 401);
  }

  let targetDate = vietnamDateKey(new Date(), 1);
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.target_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.target_date)) {
      targetDate = body.target_date;
    }

    const [{ data: allStudents, error: studentsError }, { data: memberships, error: membersError }] = await Promise.all([
      admin.from("students").select("mssv,name").order("mssv").limit(1000),
      admin.from("team_group_members").select("mssv").limit(5000),
    ]);
    if (studentsError) throw new Error(`Không đọc được danh sách sinh viên: ${studentsError.message}`);
    if (membersError) throw new Error(`Không đọc được thành viên nhóm: ${membersError.message}`);

    const students = allStudents || [];
    const nameById = new Map(students.map((student) => [student.mssv, student.name || student.mssv]));
    const memberIds = [...new Set((memberships || []).map((row) => row.mssv).filter(Boolean))];
    if (!memberIds.length) throw new Error("Chưa có thành viên trong nhóm.");

    const allSchedules: any[] = [];
    const failedIds: string[] = [];
    for (let i = 0; i < students.length; i += 6) {
      const batch = students.slice(i, i + 6);
      const results = await Promise.all(batch.map(async (student) => {
        try {
          const response = await fetch("https://tapi.lhu.edu.vn/calen/auth/XemLich_LichSinhVien", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              StudentID: student.mssv,
              Ngay: `${targetDate}T00:00:00+07:00`,
              PageIndex: 1,
              PageSize: 100,
            }),
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          const items = payload?.data?.[2];
          if (!Array.isArray(items)) throw new Error("ME trả dữ liệu sai định dạng");
          return items.map((item: any) => ({
            mssv: student.mssv,
            subject_name: String(item.TenMonHoc || "Chưa rõ").trim(),
            room_name: String(item.TenPhong || "Online").trim(),
            teacher_name: String(item.GiaoVien || "").trim(),
            start_time: normalizeMeDateTime(item.ThoiGianBD),
            end_time: normalizeMeDateTime(item.ThoiGianKT),
            day_of_week: Number(item.Thu) || 0,
          }));
        } catch (error) {
          failedIds.push(student.mssv);
          console.error("ME schedule request failed", student.mssv, error);
          return [];
        }
      }));
      results.forEach((rows) => allSchedules.push(...rows));
    }
    if (!students.length) throw new Error("Danh sách sinh viên đang trống.");
    if (failedIds.length) throw new Error(`ME không trả đủ lịch (${failedIds.length}/${students.length} sinh viên); giữ nguyên dữ liệu cũ.`);

    const dateStart = new Date(`${targetDate}T00:00:00+07:00`).toISOString();
    const nextDate = vietnamDateKey(new Date(`${targetDate}T12:00:00+07:00`), 1);
    const dateEnd = new Date(`${nextDate}T00:00:00+07:00`).toISOString();
    const daySchedules = allSchedules.filter((row) =>
      new Date(row.start_time).toLocaleDateString("en-CA", { timeZone }) === targetDate
    );
    const { count: existingCount, error: countError } = await admin
      .from("student_schedules")
      .select("id", { count: "exact", head: true })
      .lt("start_time", dateEnd)
      .gte("end_time", dateStart);
    if (countError) throw new Error(`Không thể xác minh lịch cũ: ${countError.message}`);
    if (!daySchedules.length && (existingCount || 0) > 0) {
      throw new Error("ME trả về lịch trống nhưng lịch cũ đang có dữ liệu; giữ nguyên lịch cũ để tránh xóa nhầm.");
    }

    const { data: replaceResult, error: replaceError } = await admin.rpc(
      "server_replace_student_schedules_for_date",
      { p_schedules: daySchedules, p_date: targetDate },
    );
    if (replaceError || !replaceResult?.ok) {
      throw new Error(replaceError?.message || replaceResult?.message || "Không lưu được lịch mới.");
    }

    const members = memberIds.map((mssv) => ({ mssv, name: nameById.get(mssv) || mssv }));
    const periods = buildPeriods(targetDate, members, daySchedules);
    const { error: insertError } = await admin.from("zalo_schedule_previews").insert({
      target_date: targetDate,
      status: "ready",
      member_count: members.length,
      periods,
    });
    if (insertError) throw new Error(`Đã đồng bộ lịch nhưng chưa lưu được bản gửi: ${insertError.message}`);

    return json({
      ok: true,
      target_date: targetDate,
      member_count: members.length,
      schedule_count: daySchedules.length,
      periods: Object.fromEntries(Object.entries(periods).map(([key, value]: [string, any]) => [key, {
        free_count: value.free_count,
        busy_count: value.busy_count,
      }])),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("prepare-zalo-schedule failed", targetDate, message);
    await admin.from("zalo_schedule_previews").insert({
      target_date: targetDate,
      status: "error",
      member_count: 0,
      periods: {},
      error_message: message.slice(0, 1000),
    });
    return json({ ok: false, target_date: targetDate, message }, 500);
  }
});
