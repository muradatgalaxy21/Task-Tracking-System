import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole, resolveEffectiveRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

// PATCH /api/invitations/[id] - Approve or reject a pending invitation (workspace Admin/Owner only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { action } = await req.json(); // "approve" | "reject"

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    }

    const invitation = await prisma.invitation.findUnique({ where: { id } });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // Verify caller is a workspace Admin/Owner for this invitation's workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: invitation.workspace_id,
          user_id: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const effectiveRole = resolveEffectiveRole(session.user.role || "Member", membership.role);

    if (!hasMinimumRole(effectiveRole, "Admin")) {
      return NextResponse.json({ error: "Requires workspace Admin role" }, { status: 403 });
    }

    if (invitation.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ error: "Invitation is not pending approval" }, { status: 409 });
    }

    if (action === "approve") {
      if (invitation.claimer_id) {
        // Add the waiting user to the workspace if not already a member
        const existing = await prisma.workspaceMember.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: invitation.workspace_id,
              user_id: invitation.claimer_id,
            },
          },
        });

        if (!existing) {
          await prisma.workspaceMember.create({
            data: {
              workspace_id: invitation.workspace_id,
              user_id: invitation.claimer_id,
              role: "Member",
            },
          });
        }

        // Mark as used since the claimer has now joined
        await prisma.invitation.update({
          where: { id },
          data: { status: "USED" },
        });
      } else {
        // No claimer yet — activate so the next person to use it joins instantly
        await prisma.invitation.update({
          where: { id },
          data: { status: "ACTIVE", is_admin_generated: true },
        });
      }

      return NextResponse.json({ success: true, action: "approved" });
    }

    // Reject: void the invitation
    await prisma.invitation.update({
      where: { id },
      data: { status: "EXPIRED" },
    });

    return NextResponse.json({ success: true, action: "rejected" });
  } catch (err) {
    console.error("PATCH_INVITATION_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/invitations/[id] - Cancel an invitation (creator or workspace Admin/Owner)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const invitation = await prisma.invitation.findUnique({ where: { id } });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: invitation.workspace_id,
          user_id: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const effectiveRole = resolveEffectiveRole(session.user.role || "Member", membership.role);
    const isAdmin = hasMinimumRole(effectiveRole, "Admin");

    // Creator can delete their own; admin can delete any
    if (!isAdmin && invitation.invited_by_id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.invitation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE_INVITATION_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
