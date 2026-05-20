import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { email, password, workspaceName, inviteCode } = await req.json();

    if (!email || !password) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    if (password.length < 8) {
      return new NextResponse("Password must be at least 8 characters", { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return new NextResponse("Email already exists", { status: 400 });
    }

    // Validate the invite code before creating the user to avoid partial state.
    // Check the Invitation table first (new codes), then fall back to the legacy
    // Workspace.invite_code field (static UUID codes from onboarding).
    let targetWorkspace = null;
    let targetInvitation = null;
    if (inviteCode) {
      const normalizedCode = inviteCode.trim().toUpperCase();

      // New Invitation table lookup
      const invitation = await prisma.invitation.findUnique({
        where: { code: normalizedCode },
      });

      if (invitation) {
        if (invitation.status === "USED" || invitation.status === "EXPIRED") {
          return new NextResponse("This invitation code is no longer valid.", { status: 400 });
        }
        if (invitation.expires_at && invitation.expires_at < new Date()) {
          return new NextResponse("This invitation has expired.", { status: 400 });
        }
        targetWorkspace = await prisma.workspace.findUnique({
          where: { id: invitation.workspace_id },
        });
        targetInvitation = invitation;
      } else {
        // Legacy static code fallback (also try original casing for UUID codes)
        targetWorkspace =
          (await prisma.workspace.findUnique({ where: { invite_code: normalizedCode } })) ??
          (await prisma.workspace.findFirst({ where: { invite_code: inviteCode.trim() } }));
      }

      if (!targetWorkspace) {
        return new NextResponse("Invalid invite code", { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
    });

    // New workspace: user becomes the Owner
    if (workspaceName && !inviteCode) {
      await prisma.workspace.create({
        data: {
          name: workspaceName.trim(),
          created_by: user.id,
          invite_code: randomUUID(),
          members: {
            create: { user_id: user.id, role: "Owner" },
          },
        },
      });
    }

    // Joining an existing workspace: user enters as a Member.
    // For ACTIVE invitations, mark the code as USED atomically.
    // For PENDING_APPROVAL invitations, record the claimer instead.
    if (targetWorkspace) {
      if (targetInvitation) {
        if (targetInvitation.status === "ACTIVE") {
          await prisma.$transaction([
            prisma.workspaceMember.create({
              data: { workspace_id: targetWorkspace.id, user_id: user.id, role: "Member" },
            }),
            prisma.invitation.update({
              where: { id: targetInvitation.id },
              data: { status: "USED" },
            }),
          ]);
        } else {
          // PENDING_APPROVAL: record the claimer so an admin can approve
          await prisma.invitation.update({
            where: { id: targetInvitation.id },
            data: { claimer_id: user.id, claimer_email: user.email, claimed_at: new Date() },
          });
        }
      } else {
        // Legacy static workspace code — join immediately
        await prisma.workspaceMember.create({
          data: { workspace_id: targetWorkspace.id, user_id: user.id, role: "Member" },
        });
      }
    }

    // Log the signup event — workspace_id is null since the user has no workspace yet
    writeAuditLog({
      workspace_id: null,
      user_id: user.id,
      actor_name: user.email || "Unknown",
      actor_email: user.email,
      event_type: "user_signup",
      entity_id: user.id,
      entity_name: user.email,
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("SIGNUP_ERROR", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
