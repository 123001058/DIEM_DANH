const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://nhjkpknhybenkxwadvzv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h1nRwciz_rOgnD88ZCnkIw_v0Czf1L8';
const AUTH_SUFFIX = '@sv.local';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  // Login as admin
  const { data, error } = await supabase.auth.signInWithPassword({
    email: '123001058' + AUTH_SUFFIX,
    password: 'new_admin_password_or_something_maybe?'
  });
  
  if (error) {
    console.error('Login failed, trying password=123001058...');
    const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({
      email: '123001058' + AUTH_SUFFIX,
      password: '123001058'
    });
    if (e2) {
      console.error('Login failed again:', e2.message);
      return;
    }
  }

  console.log('Logged in successfully!');

  // Invoke edge function
  console.log('Invoking admin-reset-password for 123001058...');
  const res = await supabase.functions.invoke('admin-reset-password', {
    body: { target_mssv: '123001058' }
  });
  
  console.log('Response:', res);
}

run();
