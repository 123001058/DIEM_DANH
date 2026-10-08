import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }
    const callerId = userData.user.id

    // Check if caller is Admin
    const { data: isAdmin, error: adminErr } = await supabaseClient.rpc('is_admin')
      
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Permission denied (Not Admin)' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    const { target_mssv } = await req.json()
    if (!target_mssv) {
      return new Response(JSON.stringify({ error: 'Missing target_mssv' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // Get target user_id from profiles
    const { data: targetProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('mssv', target_mssv)
      .maybeSingle()

    let targetUserId = targetProfile?.user_id

    // Check if target is also an admin (disallow resetting other admins)
    const { data: targetAdmin } = await supabaseAdmin
      .from('admin_mssv')
      .select('mssv')
      .eq('mssv', target_mssv)
      .maybeSingle()

    if (targetAdmin) {
      return new Response(JSON.stringify({ error: "Cannot reset another Admin's password" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8)

    if (!targetUserId) {
      // Missing in profiles/Auth. Check if exists in students table
      const { data: student } = await supabaseAdmin.from('students').select('name').eq('mssv', target_mssv).maybeSingle()
      
      if (!student) {
        return new Response(JSON.stringify({ error: 'Student not found in students list' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
      }

      // Create new auth user
      const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: `${target_mssv}@sv.local`,
        password: tempPassword,
        email_confirm: true
      })

      if (createErr) {
        return new Response(JSON.stringify({ error: 'Failed to create missing user: ' + createErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
      }
      
      targetUserId = newAuth.user.id

      // Upsert profile
      await supabaseAdmin.from('profiles').upsert({
        user_id: targetUserId,
        mssv: target_mssv,
        full_name: student.name,
        is_admin: false
      })
    } else {
      // Reset password for existing user
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword
      })

      if (resetErr) {
        return new Response(JSON.stringify({ error: 'Failed to reset password: ' + resetErr.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
      }
    }

    return new Response(JSON.stringify({ tempPassword }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
