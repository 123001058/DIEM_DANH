import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function makeTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const random = new Uint8Array(12)
  crypto.getRandomValues(random)
  return Array.from(random, value => alphabet[value % alphabet.length]).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Thiếu token xác thực.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }
    const callerId = userData.user.id

    // Kiểm tra quyền Admin của người gọi (check qua bảng profiles + admin_mssv)
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('mssv, full_name')
      .eq('user_id', callerId)
      .maybeSingle()

    let isAdmin = false
    if (callerProfile?.mssv) {
      const { data: adminRecord } = await supabaseAdmin
        .from('admin_mssv')
        .select('mssv')
        .eq('mssv', callerProfile.mssv)
        .maybeSingle()
      if (adminRecord) isAdmin = true
    }

    if (!isAdmin) {
      const { data: rpcAdmin } = await supabaseClient.rpc('is_admin')
      if (rpcAdmin) isAdmin = true
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Bạn không có quyền quản trị viên để thực hiện thao tác này.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    const { target_mssv, request_id } = await req.json()
    if (!target_mssv) {
      return new Response(JSON.stringify({ error: 'Thiếu mã số sinh viên (target_mssv).' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const cleanMssv = String(target_mssv).trim()

    // Kiểm tra sinh viên có trong bảng students không
    const { data: targetStudent } = await supabaseAdmin
      .from('students')
      .select('name')
      .eq('mssv', cleanMssv)
      .maybeSingle()

    if (!targetStudent) {
      return new Response(JSON.stringify({ error: 'Không tìm thấy sinh viên này trong danh sách lớp.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
    }

    if (request_id) {
      const { data: resetRequest, error: requestError } = await supabaseAdmin
        .from('password_reset_requests')
        .select('id, mssv, status')
        .eq('id', request_id)
        .maybeSingle()
      if (requestError || !resetRequest || resetRequest.mssv !== cleanMssv || resetRequest.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Yêu cầu reset không còn hợp lệ hoặc đã được xử lý trước đó.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
      }
    }

    // Không cho phép Admin con reset tài khoản Admin chính (123001058) trừ khi chính Admin 123001058 thực hiện
    if (cleanMssv === '123001058' && callerProfile?.mssv !== '123001058') {
      return new Response(JSON.stringify({ error: 'Không thể reset mật khẩu của Quản trị viên chính.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    // Tạo mật khẩu tạm ngẫu nhiên
    const tempPassword = makeTemporaryPassword()
    const emailToFind = `${cleanMssv.toLowerCase()}@sv.local`

    // Lấy thông tin user_id từ profiles nếu có
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('mssv', cleanMssv)
      .maybeSingle()

    let targetUserId = targetProfile?.user_id
    let needProfileUpsert = false

    if (targetUserId) {
      // Cố gắng cập nhật mật khẩu cho user hiện tại
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword
      })

      if (resetErr) {
        // Nếu user id trong profile không còn tồn tại trong auth.users -> xóa profile mồ côi để tạo mới
        const isNotFound = resetErr.message?.toLowerCase().includes('not found') || resetErr.status === 404
        if (isNotFound) {
          await supabaseAdmin.from('profiles').delete().eq('mssv', cleanMssv)
          targetUserId = null
        } else {
          return new Response(JSON.stringify({ error: 'Lỗi cập nhật mật khẩu: ' + resetErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
        }
      }
    }

    if (!targetUserId) {
      // Tìm xem email này đã tồn tại trong Auth chưa
      const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listErr) {
        return new Response(JSON.stringify({ error: 'Lỗi kiểm tra danh sách Auth: ' + listErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
      }

      const existingUser = listData.users.find(u => (u.email || '').toLowerCase() === emailToFind)

      if (existingUser) {
        targetUserId = existingUser.id
        const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          password: tempPassword
        })
        if (resetErr) {
          return new Response(JSON.stringify({ error: 'Lỗi đặt lại mật khẩu Auth: ' + resetErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
        }
      } else {
        // Tạo mới auth user
        const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: emailToFind,
          password: tempPassword,
          email_confirm: true
        })

        if (createErr) {
          return new Response(JSON.stringify({ error: 'Lỗi tạo tài khoản Auth: ' + createErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
        }
        targetUserId = newAuth.user.id
      }
      needProfileUpsert = true
    }

    if (needProfileUpsert) {
      // Upsert profile (bảng profiles chuẩn: user_id, mssv, full_name - tuyệt đối không có is_admin)
      const { error: upsertErr } = await supabaseAdmin.from('profiles').upsert({
        user_id: targetUserId,
        mssv: cleanMssv,
        full_name: targetStudent.name
      }, { onConflict: 'user_id' })

      if (upsertErr) {
        return new Response(JSON.stringify({ error: 'Lỗi lưu thông tin profile: ' + upsertErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
      }
    }

    // Ghi nhận lịch sử reset mật khẩu
    const resetByName = callerProfile?.full_name || userData.user.email || 'Admin'
    const { error: historyError } = await supabaseAdmin.from('password_reset_history').insert({
      mssv: cleanMssv,
      student_name: targetStudent.name || cleanMssv,
      temp_password: tempPassword,
      reset_by: callerId,
      reset_by_name: resetByName,
      request_id: request_id || null
    })

    return new Response(JSON.stringify({ tempPassword, historySaved: !historyError }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Lỗi máy chủ: ' + err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
