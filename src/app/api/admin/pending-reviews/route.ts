import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac";
import { resolveEffectiveRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

// GET /api/admin/pending-reviews
// Query params: activeWorkspaceId
// Returns the count of pending reviews for the active workspace,
// plus a list of other admin-owned workspaces that have pending reviews.
export async function GET(req: Request) {
  // 1. Authenticate user session. If unauthorized, reject.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const activeWorkspaceId = searchParams.get("activeWorkspaceId");

  try {
    const userId = session.user.id;
    const globalRole = session.user.role || "Member";

    // 2. Fetch the user's workspace memberships with workspace details.
    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: userId },
      include: {
        workspace: {
          select: { id: true, name: true },
        },
      },
    });

    // 3. Filter memberships to only those workspaces where the user has Admin or Owner effective role.
    const adminMemberships = memberships.filter((m) => {
      const effectiveRole = resolveEffectiveRole(globalRole, m.role);
      return hasMinimumRole(effectiveRole, "Admin");
    });

    if (adminMemberships.length === 0) {
      return NextResponse.json({
        activeWorkspace: null,
        otherWorkspaces: [],
      });
    }

    const adminWorkspaceIds = adminMemberships.map((m) => m.workspace_id);

    // 4. Query the count of "In Review" tasks for all admin-controlled workspaces in a single aggregation.
    const reviewsGroup = await prisma.taskLedger.groupBy({
      by: ["workspace_id"],
      where: {
        workspace_id: { in: adminWorkspaceIds },
        status: "In Review",
      },
      _count: {
        task_id: true,
      },
    });

    // Create a lookup map: workspaceId -> pendingCount
    const pendingMap: Record<string, number> = {};
    for (const group of reviewsGroup) {
      if (group.workspace_id) {
        pendingMap[group.workspace_id] = group._count.task_id;
      }
    }

    // 5. Structure the response into active workspace status and other workspaces.
    let activeWorkspaceInfo = null;
    const otherWorkspacesInfo: { id: string; name: string; pendingCount: number }[] = [];

    for (const m of adminMemberships) {
      const ws = m.workspace;
      const count = pendingMap[ws.id] || 0;

      if (activeWorkspaceId && ws.id === activeWorkspaceId) {
        activeWorkspaceInfo = {
          id: ws.id,
          name: ws.name,
          pendingCount: count,
          isAdmin: true,
        };
      } else {
        if (count > 0) {
          otherWorkspacesInfo.push({
            id: ws.id,
            name: ws.name,
            pendingCount: count,
          });
        }
      }
    }

    // If an activeWorkspaceId was provided but the user is not an admin in it, fetch its name without admin flag.
    if (activeWorkspaceId && !activeWorkspaceInfo) {
      const targetWorkspace = memberships.find((m) => m.workspace_id === activeWorkspaceId);
      if (targetWorkspace) {
        activeWorkspaceInfo = {
          id: targetWorkspace.workspace.id,
          name: targetWorkspace.workspace.name,
          pendingCount: 0, // Not counting as admin
          isAdmin: false,
        };
      }
    }

    return NextResponse.json({
      activeWorkspace: activeWorkspaceInfo,
      otherWorkspaces: otherWorkspacesInfo,
    });
  } catch (error) {
    console.error("Failed to fetch pending reviews count for admin:", error);
    return NextResponse.json(
      { error: "Failed to retrieve pending reviews list" },
      { status: 500 }
    );
  }
}
