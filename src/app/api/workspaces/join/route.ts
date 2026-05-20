import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";

// POST /api/workspaces/join - Join an existing workspace using an invite code
export async function POST(req: Request) {
  // Access session through the result object so TypeScript can narrow correctly
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const userId = (authResult.session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { inviteCode } = await req.json();

    if (!inviteCode?.trim()) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const code = inviteCode.trim();
    const normalizedCode = code.toUpperCase();

    // Check the new Invitation table first
    const invitation = await prisma.invitation.findUnique({
      where: { code: normalizedCode },
    });

    if (invitation) {
      if (invitation.status === "USED" || invitation.status === "EXPIRED") {
        return NextResponse.json(
          { error: "This invitation code is no longer valid." },
          { status: 410 }
        );
      }

      if (invitation.expires_at && invitation.expires_at < new Date()) {
        await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
        return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
      }

      // Guard against joining a workspace you already belong to
      const existing = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: invitation.workspace_id,
            user_id: userId,
          },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "You are already a member of this workspace." },
          { status: 409 }
        );
      }

      if (invitation.status === "ACTIVE") {
        // Instant join and mark the code used
        await prisma.$transaction([
          prisma.workspaceMember.create({
            data: {
              workspace_id: invitation.workspace_id,
              user_id: userId,
              role: "Member",
            },
          }),
          prisma.invitation.update({
            where: { id: invitation.id },
            data: { status: "USED" },
          }),
        ]);

        const workspace = await prisma.workspace.findUnique({
          where: { id: invitation.workspace_id },
        });

        return NextResponse.json({ workspace, status: "joined" });
      }

      // PENDING_APPROVAL: record the claimer if this is the first attempt
      if (invitation.claimer_id && invitation.claimer_id !== userId) {
        return NextResponse.json(
          { error: "This invitation is already pending approval for another user." },
          { status: 409 }
        );
      }

      if (!invitation.claimer_id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });

        await prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            claimer_id: userId,
            claimer_email: dbUser?.email ?? null,
            claimed_at: new Date(),
          },
        });
      }

      return NextResponse.json({ status: "pending_approval" }, { status: 202 });
    }

    // Fall back to the legacy Workspace.invite_code (reusable static code)
    const workspace = await prisma.workspace.findUnique({
      where: { invite_code: normalizedCode },
    });

    if (!workspace) {
      // Try the original (non-uppercased) code for legacy codes that are UUIDs
      const workspaceLower = await prisma.workspace.findFirst({
        where: { invite_code: code },
      });

      if (!workspaceLower) {
        return NextResponse.json({ error: "Invalid invitation code." }, { status: 404 });
      }

      const existingLower = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: workspaceLower.id, user_id: userId },
        },
      });

      if (existingLower) {
        return NextResponse.json(
          { error: "You are already a member of this workspace." },
          { status: 409 }
        );
      }

      await prisma.workspaceMember.create({
        data: { workspace_id: workspaceLower.id, user_id: userId, role: "Member" },
      });

      return NextResponse.json({ workspace: workspaceLower, status: "joined" });
    }

    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: { workspace_id: workspace.id, user_id: userId },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "You are already a member of this workspace." },
        { status: 409 }
      );
    }

    await prisma.workspaceMember.create({
      data: { workspace_id: workspace.id, user_id: userId, role: "Member" },
    });

    return NextResponse.json({ workspace, status: "joined" });
  } catch (err) {
    console.error("JOIN_WORKSPACE_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
