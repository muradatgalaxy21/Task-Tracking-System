-- -------------------------------------------------------------------
-- Migration 004: Workspaces, Pages, and Priority
-- Adds workspace-based organization and task priority field.
-- Run this in Supabase SQL Editor after previous migrations.
-- -------------------------------------------------------------------

-- 1. Create workspaces table
--    Each workspace is an isolated project/team container.
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create workspace_members junction table
--    Maps users to workspaces with a role within that workspace.
CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'Member' CHECK (role IN ('Admin', 'Member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 3. Create pages table
--    Each page belongs to a workspace and has a type.
CREATE TABLE IF NOT EXISTS public.pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  page_type TEXT DEFAULT 'tasks' CHECK (page_type IN ('tasks', 'notes', 'attendance')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add workspace_id to tasks_ledger (optional FK)
--    Existing tasks without a workspace_id remain valid.
ALTER TABLE public.tasks_ledger
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- 5. Add priority column to tasks_ledger
--    Nullable so existing tasks are unaffected.
ALTER TABLE public.tasks_ledger
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('High', 'Medium', 'Low'));

-- -------------------------------------------------------------------
-- RLS Policies for Workspaces
-- -------------------------------------------------------------------

-- Fix for Infinite Recursion:
-- We use security definer functions to check membership without triggering RLS loops.

CREATE OR REPLACE FUNCTION public.is_member(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin(ws_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = 'Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- Workspace: viewable by members of that workspace
DROP POLICY IF EXISTS "workspace_select" ON public.workspaces;
CREATE POLICY "workspace_select" ON public.workspaces
  FOR SELECT USING (public.is_member(id));

-- Workspace: insertable by any authenticated user
DROP POLICY IF EXISTS "workspace_insert" ON public.workspaces;
CREATE POLICY "workspace_insert" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Workspace: updatable by workspace admins only
DROP POLICY IF EXISTS "workspace_update" ON public.workspaces;
CREATE POLICY "workspace_update" ON public.workspaces
  FOR UPDATE USING (public.is_admin(id));

-- Workspace Members: viewable by fellow workspace members
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT USING (public.is_member(workspace_id));

-- Workspace Members: insertable by workspace admins (or if first member)
DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT WITH CHECK (
    public.is_admin(workspace_id)
    OR NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = workspace_id)
  );

-- Pages: viewable by workspace members
DROP POLICY IF EXISTS "pages_select" ON public.pages;
CREATE POLICY "pages_select" ON public.pages
  FOR SELECT USING (public.is_member(workspace_id));

-- Pages: insertable by workspace members
DROP POLICY IF EXISTS "pages_insert" ON public.pages;
CREATE POLICY "pages_insert" ON public.pages
  FOR INSERT WITH CHECK (public.is_member(workspace_id));

-- Pages: deletable by workspace admins
DROP POLICY IF EXISTS "pages_delete" ON public.pages;
CREATE POLICY "pages_delete" ON public.pages
  FOR DELETE USING (public.is_admin(workspace_id));
