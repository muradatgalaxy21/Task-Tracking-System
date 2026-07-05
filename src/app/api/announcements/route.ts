import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole, resolveEffectiveRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

// GET /api/announcements?workspaceId=xxx
// Returns active announcements for the user's active workspace + any global announcements.
// Expired announcements (past expires_at) are automatically excluded.
export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");

  try {
    // Enforce isolation — only surface workspace-scoped announcements to members of
    // that workspace (or an Admin). Global announcements remain visible to everyone.
    let scopedWorkspaceId: string | null = null;
    if (workspaceId) {
      if (hasMinimumRole(session.user.role, "Admin")) {
        scopedWorkspaceId = workspaceId;
      } else {
        const membership = await prisma.workspaceMember.findUnique({
          where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
          select: { user_id: true },
        });
        if (membership) scopedWorkspaceId = workspaceId;
      }
    }

    const now = new Date();

    // 1. Build the filter: active announcements that are not expired.
    // 2. Include workspace-scoped announcements for the given workspace + global ones (null workspace_id).
    const announcements = await prisma.announcement.findMany({
      where: {
        active: true,
        OR: [
          // Global announcements (visible to everyone)
          { workspace_id: null },
          // Workspace-specific announcements (only when caller is a verified member)
          ...(scopedWorkspaceId ? [{ workspace_id: scopedWorkspaceId }] : []),
        ],
        // Exclude expired announcements (null expires_at = never expires)
        AND: [
          {
            OR: [
              { expires_at: null },
              { expires_at: { gt: now } },
            ],
          },
        ],
      },
      orderBy: { created_at: "desc" },
      include: {
        user: {
          select: { full_name: true, image: true },
        },
      },
    });

    return NextResponse.json(announcements);
  } catch (err) {
    console.error("GET_ANNOUNCEMENTS_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/announcements
// Creates a new announcement. Only Admin (global) or workspace Owner/Admin can post.
// Body: { content, type?, workspaceId?, expiresAt? }
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content, type, workspaceId, expiresAt } = await req.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Announcement content is required." }, { status: 400 });
    }

    // 1. Fetch user's global role for authorization checks.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // 2. Determine if user has permission to create the announcement.
    // Global announcements require global Admin role.
    // Workspace announcements require workspace Admin/Owner role.
    if (workspaceId) {
      // Check workspace membership role
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: workspaceId,
            user_id: session.user.id,
          },
        },
        select: { role: true },
      });

      // Resolve effective role: higher of global and workspace-local
      const effectiveRole = resolveEffectiveRole(user.role, membership?.role);

      if (!hasMinimumRole(effectiveRole, "Admin")) {
        return NextResponse.json(
          { error: "Only Admins and Owners can create announcements." },
          { status: 403 }
        );
      }
    } else {
      // Global announcement — requires global Admin role
      if (!hasMinimumRole(user.role, "Admin")) {
        return NextResponse.json(
          { error: "Only global Admins can create global announcements." },
          { status: 403 }
        );
      }
    }

    // 3. Validate announcement type against allowed values.
    const validTypes = ["info", "warning", "urgent"];
    const announcementType = validTypes.includes(type) ? type : "info";

    // 4. Create the announcement record in the database.
    const announcement = await prisma.announcement.create({
      data: {
        workspace_id: workspaceId || null,
        user_id: session.user.id,
        content: content.trim(),
        type: announcementType,
        expires_at: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        user: {
          select: { full_name: true, image: true },
        },
      },
    });

    return NextResponse.json(announcement, { status: 201 });
  } catch (err) {
    console.error("POST_ANNOUNCEMENT_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/announcements?id=xxx
// Deactivates an announcement. Only the creator or an Admin/Owner can deactivate.
export async function DELETE(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Announcement ID is required." }, { status: 400 });
  }

  try {
    // 1. Fetch the announcement to verify ownership/permissions.
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { user_id: true, workspace_id: true },
    });

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }

    // 2. Check permissions: authorized if creator, global Admin, or workspace Admin/Owner.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const isCreator = announcement.user_id === session.user.id;
    const isGlobalAdmin = user ? hasMinimumRole(user.role, "Admin") : false;
    let isAuthorized = isCreator || isGlobalAdmin;

    if (!isAuthorized && announcement.workspace_id) {
      // Check if user is a workspace Admin/Owner
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: announcement.workspace_id,
            user_id: session.user.id,
          },
        },
        select: { role: true },
      });
      if (membership && hasMinimumRole(membership.role, "Admin")) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "You do not have permission to remove this announcement." },
        { status: 403 }
      );
    }

    // 3. Soft-delete by setting active to false (preserves audit trail).
    await prisma.announcement.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE_ANNOUNCEMENT_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
