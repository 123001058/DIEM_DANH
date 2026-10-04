import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    const token = authHeader.replace('Bearer ', '')
    
    // Validate token and get user ID
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized')

    // Check if the user is an admin
    const { data: adminData } = await supabaseClient
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (!adminData) {
      throw new Error('Forbidden: You are not an admin.')
    }

    const { username, password, role, name, mssv } = await req.json()
    const email = `${username}@diemdanh.local`

    // Create user via Admin API
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { name: name, mssv: mssv, app_role: role }
    })

    if (createError) throw createError

    // Insert into profiles
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .insert({
        user_id: newUser.user.id,
        username: username,
        role: role,
        full_name: name,
        mssv: mssv
      })

    if (profileError) {
        // Rollback
        await supabaseClient.auth.admin.deleteUser(newUser.user.id)
        throw profileError
    }

    return new Response(
      JSON.stringify({ ok: true, user_id: newUser.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
