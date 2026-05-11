-- =====================================================================
-- AI & BEYOND EVALUATOR: Database Schema
-- Run this in the Supabase SQL Editor to create all required tables.
-- =====================================================================

-- 1. PROFILES TABLE
-- Stores team member information and roles.
-- The 'id' links to Supabase Auth's auth.users table.
-- Default role is 'Member'; Admin is set manually in the database.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Admin', 'Member')),
  sessions_attended INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TASKS LEDGER TABLE
-- Stores main tasks assigned to team members.
-- points_value is a generated column: estimated_days * 5.
CREATE TABLE IF NOT EXISTS public.tasks_ledger (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  estimated_days INTEGER NOT NULL DEFAULT 1,
  points_value INTEGER GENERATED ALWAYS AS (estimated_days * 5) STORED,
  status TEXT NOT NULL DEFAULT 'Todo' CHECK (status IN ('Todo', 'In Progress', 'In Review', 'Completed')),
  max_deadline TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 3. SUB-TASKS TABLE
-- Stores sub-items within a main task.
-- Both Admin and Members can manage sub-tasks.
CREATE TABLE IF NOT EXISTS public.sub_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_task_id UUID NOT NULL REFERENCES public.tasks_ledger(task_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Todo' CHECK (status IN ('Todo', 'Completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. FUNCTION: Auto-create profile on signup
-- When a new user signs up via Supabase Auth, this trigger
-- automatically inserts a corresponding row into the profiles table.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'Member'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. TRIGGER: Fire after each new auth signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_tasks ENABLE ROW LEVEL SECURITY;
