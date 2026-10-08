import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Xử lý CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Lấy JWT từ request để xác thực caller
    const authHeader = req.headers.get('Authorization')!
    
    // Khởi tạo Supabase client với quyền của user đang gọi
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    
    // Xác minh Admin
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin')
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Requires admin privileges' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { target_mssv } = await req.json()
    if (!target_mssv) {
      return new Response(JSON.stringify({ error: 'Missing target_mssv' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Khởi tạo Admin client với Service Role Key để thao tác bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Admin Scope Check: Không cho phép reset tài khoản của Admin khác
    const { data: checkAdmin, error: checkAdminErr } = await adminClient
      .from('admin_mssv')
      .select('mssv')
      .eq('mssv', target_mssv)
      .maybeSingle()

    if (checkAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Không được phép reset mật khẩu của Admin' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Tìm user_id dựa trên mssv
    const { data: profileData, error: profileErr } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('mssv', target_mssv)
      .single()
      
    if (profileErr || !profileData) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const userId = profileData.user_id

    // Lấy user hiện tại để bảo toàn app_metadata
    const { data: authUser, error: authUserErr } = await adminClient.auth.admin.getUserById(userId)
    if (authUserErr || !authUser?.user) throw new Error('Could not fetch user details')

    const currentAppMeta = authUser.user.app_metadata || {}
    const tempPassword = 'LH' + Math.random().toString(36).substring(2, 8).toUpperCase()

    // Cập nhật mật khẩu bằng Admin Auth API VÀ đặt marker app_metadata
    // Marker này sẽ được Trigger dưới DB bắt để set must_change_password = true một cách Atomic
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      userId,
      { 
        password: tempPassword,
        app_metadata: { ...currentAppMeta, admin_reset_at: new Date().toISOString() }
      }
    )
    
    if (updateErr) throw updateErr

    return new Response(JSON.stringify({ tempPassword }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
