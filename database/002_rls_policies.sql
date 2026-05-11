-- =====================================================================
-- AI & BEYOND EVALUATOR: Row Level Security Policies
-- Run this AFTER 001_schema.sql in the Supabase SQL Editor.
-- =====================================================================

-- =====================================================================
-- PROFILES TABLE POLICIES
-- =====================================================================

-- 1. READ: All authenticated users can view all profiles (Transparency)
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2. UPDATE (Self): Users can update their own full_name and sessions_attended
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. UPDATE (Admin): Admin can update any profile (including role changes)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- =====================================================================
-- TASKS LEDGER TABLE POLICIES
-- =====================================================================

-- 4. READ: All authenticated users can view all tasks
DROP POLICY IF EXISTS "tasks_select_all" ON public.tasks_ledger;
CREATE POLICY "tasks_select_all"
  ON public.tasks_ledger FOR SELECT
  TO authenticated
  USING (true);

-- 5. INSERT: All authenticated users can create tasks
DROP POLICY IF EXISTS "tasks_insert_all" ON public.tasks_ledger;
CREATE POLICY "tasks_insert_all"
  ON public.tasks_ledger FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 6. UPDATE (Admin): Admin can update any field on any task
DROP POLICY IF EXISTS "tasks_update_admin" ON public.tasks_ledger;
CREATE POLICY "tasks_update_admin"
  ON public.tasks_ledger FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- 7. UPDATE (Member): Members can update ONLY description and status
--    of tasks assigned to them, and ONLY if the task is NOT locked
--    (status is not 'In Review' or 'Completed').
DROP POLICY IF EXISTS "tasks_update_member" ON public.tasks_ledger;
CREATE POLICY "tasks_update_member"
  ON public.tasks_ledger FOR UPDATE
  TO authenticated
  USING (
    assignee_id = auth.uid()
    AND status NOT IN ('In Review', 'Completed')
  )
  WITH CHECK (
    assignee_id = auth.uid()
  );

-- 8. DELETE: Only Admin can delete tasks
DROP POLICY IF EXISTS "tasks_delete_admin" ON public.tasks_ledger;
CREATE POLICY "tasks_delete_admin"
  ON public.tasks_ledger FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- =====================================================================
-- SUB-TASKS TABLE POLICIES
-- =====================================================================

-- 9. READ: All authenticated users can view all sub-tasks
DROP POLICY IF EXISTS "subtasks_select_all" ON public.sub_tasks;
CREATE POLICY "subtasks_select_all"
  ON public.sub_tasks FOR SELECT
  TO authenticated
  USING (true);

-- 10. INSERT: All authenticated users can add sub-tasks
DROP POLICY IF EXISTS "subtasks_insert_all" ON public.sub_tasks;
CREATE POLICY "subtasks_insert_all"
  ON public.sub_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 11. UPDATE: All authenticated users can update sub-tasks
DROP POLICY IF EXISTS "subtasks_update_all" ON public.sub_tasks;
CREATE POLICY "subtasks_update_all"
  ON public.sub_tasks FOR UPDATE
  TO authenticated
  USING (true);

-- 12. DELETE: All authenticated users can delete sub-tasks
DROP POLICY IF EXISTS "subtasks_delete_all" ON public.sub_tasks;
CREATE POLICY "subtasks_delete_all"
  ON public.sub_tasks FOR DELETE
  TO authenticated
  USING (true);
