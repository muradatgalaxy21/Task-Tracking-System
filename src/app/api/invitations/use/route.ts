import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/invitations/use - Use a code to join a workspace.
//
// Code lookup priority:
//   1. New Invitation.code (single-use, supports approval flow)
//   2. Workspace.invite_code fallback (legacy static codes from onboarding)
//
// ACTIVE invitation: caller joins immediately, code becomes USED.
// PENDING_APPROVAL invitation: claimer is recorded; caller must wait for admin approval.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { code } = await req.json();

    if (!code?.trim()) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();

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
            user_id: session.user.id,
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
              user_id: session.user.id,
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
      if (invitation.claimer_id && invitation.claimer_id !== session.user.id) {
        return NextResponse.json(
          { error: "This invitation is already pending approval for another user." },
          { status: 409 }
        );
      }

      if (!invitation.claimer_id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { email: true },
        });

        await prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            claimer_id: session.user.id,
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
        where: { invite_code: code.trim() },
      });

      if (!workspaceLower) {
        return NextResponse.json({ error: "Invalid invitation code." }, { status: 404 });
      }

      const existingLower = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: workspaceLower.id, user_id: session.user.id },
        },
      });

      if (existingLower) {
        return NextResponse.json(
          { error: "You are already a member of this workspace." },
          { status: 409 }
        );
      }

      await prisma.workspaceMember.create({
        data: { workspace_id: workspaceLower.id, user_id: session.user.id, role: "Member" },
      });

      return NextResponse.json({ workspace: workspaceLower, status: "joined" });
    }

    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: { workspace_id: workspace.id, user_id: session.user.id },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "You are already a member of this workspace." },
        { status: 409 }
      );
    }

    await prisma.workspaceMember.create({
      data: { workspace_id: workspace.id, user_id: session.user.id, role: "Member" },
    });

    return NextResponse.json({ workspace, status: "joined" });
  } catch (err) {
    console.error("USE_INVITATION_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
