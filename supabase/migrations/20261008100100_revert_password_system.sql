-- Migration: Revert password system

DROP TRIGGER IF EXISTS on_password_changed ON auth.users;
DROP FUNCTION IF EXISTS public.handle_password_changed();

ALTER TABLE public.profiles DROP COLUMN IF EXISTS must_change_password;
