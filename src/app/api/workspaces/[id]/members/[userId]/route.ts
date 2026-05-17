import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole, resolveEffectiveRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

// DELETE /api/workspaces/[id]/members/[userId] - Remove a member from the workspace.
// Workspace Admin/Owner only. Owners cannot be removed except by another Owner.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: workspaceId, userId: targetUserId } = await params;

    // Verify caller is a workspace Admin/Owner
    const callerMembership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });

    if (!callerMembership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const callerEffectiveRole = resolveEffectiveRole(
      session.user.role || "Member",
      callerMembership.role
    );

    if (!hasMinimumRole(callerEffectiveRole, "Admin")) {
      return NextResponse.json({ error: "Requires workspace Admin role" }, { status: 403 });
    }

    // Get the target membership to check their role
    const targetMembership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "Target user is not a member of this workspace" }, { status: 404 });
    }

    // Only an Owner-level caller can remove another Owner
    if (
      targetMembership.role === "Owner" &&
      !hasMinimumRole(callerEffectiveRole, "Owner")
    ) {
      return NextResponse.json(
        { error: "Only a workspace Owner can remove another Owner" },
        { status: 403 }
      );
    }

    await prisma.workspaceMember.delete({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: targetUserId } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("REMOVE_MEMBER_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
