-- =====================================================================
-- AI & BEYOND EVALUATOR: Schema Update Migration (v3)
-- Run this in the Supabase SQL Editor AFTER 001_schema.sql and 002_rls_policies.sql.
-- This migration removes the points system and introduces daily attendance tracking.
-- =====================================================================

-- =====================================================================
-- STEP 1: UPDATE tasks_ledger TABLE
-- Remove the points_value computed column (points system is retired).
-- Add multiplier_earned to store the final multiplier at completion time.
-- =====================================================================

-- Drop the generated points_value column (no longer needed)
ALTER TABLE public.tasks_ledger DROP COLUMN IF EXISTS points_value;

-- Add multiplier_earned: stores the time-penalty multiplier when a task is completed.
-- Values: 1.0 (on time), 0.60 (1 day late), 0.40 (2 days late), 0.0 (3+ days late).
ALTER TABLE public.tasks_ledger
  ADD COLUMN IF NOT EXISTS multiplier_earned NUMERIC;

-- =====================================================================
-- STEP 2: UPDATE profiles TABLE
-- Drop sessions_attended because attendance is now tracked daily per record.
-- =====================================================================

ALTER TABLE public.profiles DROP COLUMN IF EXISTS sessions_attended;

-- =====================================================================
-- STEP 3: CREATE daily_attendance TABLE
-- Stores one row per member per date with their attendance status.
-- Only Admin can insert/update; all authenticated users can read.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.daily_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The date of the attendance record (no time component needed)
  date        DATE NOT NULL,
  -- Status must be one of three explicit values
  status      TEXT NOT NULL CHECK (status IN ('Present', 'Late', 'Absent')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate records for the same member on the same day
  UNIQUE (user_id, date)
);

-- Enable Row Level Security on the new table
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 4: RLS POLICIES FOR daily_attendance
-- =====================================================================

-- 1. READ: All authenticated users can view all attendance records.
--    This enables members to see their own history and Admin to see all.
DROP POLICY IF EXISTS "attendance_select_all" ON public.daily_attendance;
CREATE POLICY "attendance_select_all"
  ON public.daily_attendance FOR SELECT
  TO authenticated
  USING (true);

-- 2. INSERT: Only Admin can create attendance records.
DROP POLICY IF EXISTS "attendance_insert_admin" ON public.daily_attendance;
CREATE POLICY "attendance_insert_admin"
  ON public.daily_attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- 3. UPDATE: Only Admin can update existing attendance records.
DROP POLICY IF EXISTS "attendance_update_admin" ON public.daily_attendance;
CREATE POLICY "attendance_update_admin"
  ON public.daily_attendance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- 4. DELETE: Only Admin can delete attendance records.
DROP POLICY IF EXISTS "attendance_delete_admin" ON public.daily_attendance;
CREATE POLICY "attendance_delete_admin"
  ON public.daily_attendance FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );
