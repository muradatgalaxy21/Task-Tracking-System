import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole, resolveEffectiveRole } from "@/lib/rbac-utils";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function generateInviteCode(): string {
  // 4 random bytes → 8-char uppercase hex string
  return randomBytes(4).toString("hex").toUpperCase();
}

// GET /api/invitations?workspaceId=X
// Admin/Owner sees all workspace invitations. Member sees only their own.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const effectiveRole = resolveEffectiveRole(session.user.role || "Member", membership.role);
  const isAdmin = hasMinimumRole(effectiveRole, "Admin");

  const invitations = await prisma.invitation.findMany({
    where: {
      workspace_id: workspaceId,
      // Members only see invitations they created
      ...(isAdmin ? {} : { invited_by_id: session.user.id }),
    },
    include: {
      invited_by: { select: { full_name: true, email: true } },
    },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json(invitations);
}

// POST /api/invitations - Create a new invitation for the current workspace
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, email } = await req.json();

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const effectiveRole = resolveEffectiveRole(session.user.role || "Member", membership.role);
    const isAdmin = hasMinimumRole(effectiveRole, "Admin");

    // Admin/Owner invitations are immediately usable; Member invitations queue for approval
    const isAdminGenerated = isAdmin;
    const status = isAdmin ? "ACTIVE" : "PENDING_APPROVAL";

    const invitation = await prisma.invitation.create({
      data: {
        code: generateInviteCode(),
        email: email?.trim() || null,
        workspace_id: workspaceId,
        invited_by_id: session.user.id,
        is_admin_generated: isAdminGenerated,
        status,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
      include: {
        invited_by: { select: { full_name: true, email: true } },
      },
    });

    return NextResponse.json(invitation, { status: 201 });
  } catch (err) {
    console.error("CREATE_INVITATION_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
