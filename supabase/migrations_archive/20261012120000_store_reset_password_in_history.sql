alter table public.password_reset_history
  add column if not exists temp_password text;
