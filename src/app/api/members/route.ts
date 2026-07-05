import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/rbac";
import { getCachedWorkspaceMembers, getCachedAllMembers } from "@/lib/cache";

export const dynamic = "force-dynamic";

// True if the caller shares at least one workspace with the target user.
// Used to gate cross-user profile reads to people the caller can already see.
async function sharesWorkspace(callerId: string, targetId: string): Promise<boolean> {
  const callerWorkspaces = await prisma.workspaceMember.findMany({
    where: { user_id: callerId },
    select: { workspace_id: true },
  });
  const workspaceIds = callerWorkspaces.map((w) => w.workspace_id);
  if (workspaceIds.length === 0) return false;

  const shared = await prisma.workspaceMember.findFirst({
    where: { user_id: targetId, workspace_id: { in: workspaceIds } },
    select: { user_id: true },
  });
  return shared !== null;
}

// GET /api/members - Fetch members.
// With ?workspaceId=X: returns only members of that workspace (enforces isolation).
// With ?id=X: returns a single user profile (used by AuthProvider sync).
// With no params: returns all users (admin-only fallback).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const workspace_id = searchParams.get("workspaceId");

  const isAdmin = hasMinimumRole(session.user.role, "Admin");

  try {
    // Single-user lookup (used for profile sync in AuthProvider).
    // Only self, an Admin, or someone who shares a workspace may read another user's profile.
    if (id) {
      if (id !== session.user.id && !isAdmin && !(await sharesWorkspace(session.user.id, id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const member = await prisma.user.findUnique({
        where: { id },
        select: { id: true, full_name: true, email: true, role: true, image: true, task_deadline_order: true, accepted_privacy_policy: true },
      });
      return NextResponse.json(member);
    }

    // Workspace-scoped member list: includes workspace_role alongside the user fields.
    // Enforce isolation — only members of the workspace (or an Admin) may read its roster.
    if (workspace_id) {
      if (!isAdmin) {
        const membership = await prisma.workspaceMember.findUnique({
          where: { workspace_id_user_id: { workspace_id, user_id: session.user.id } },
          select: { user_id: true },
        });
        if (!membership) {
          return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
        }
      }
      return NextResponse.json(await getCachedWorkspaceMembers(workspace_id));
    }

    // Unscoped fallback: the full user directory is Admin-only.
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(await getCachedAllMembers());
  } catch (error) {
    console.error("Failed to fetch members:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
