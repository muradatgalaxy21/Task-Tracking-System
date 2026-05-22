import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { sendAccountDeletionVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// POST /api/settings/delete-account/request
// Validates account deletion constraints, saves deletion plan to token, and sends confirmation email.
export async function POST(req: Request) {
  // 1. Authenticate user and retrieve session
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const { transfers } = await req.json();

    // 2. Fetch the user details to verify role and retrieve email/name
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, full_name: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Prevent deletion if this user is the last system Owner
    if (dbUser.role === "Owner") {
      const ownerCount = await prisma.user.count({
        where: { role: "Owner" },
      });
      if (ownerCount === 1) {
        return NextResponse.json(
          {
            error:
              "You are the sole system Owner. You must promote another user to the Owner role in the Admin Panel before deleting your account.",
          },
          { status: 400 }
        );
      }
    }

    // 4. Fetch all workspaces where the user is an Owner to validate deletion/transfer requirements
    const ownedMemberships = await prisma.workspaceMember.findMany({
      where: {
        user_id: userId,
        role: "Owner",
      },
      include: {
        workspace: true,
      },
    });

    const workspacesToDelete: string[] = [];
    const validatedTransfers: Record<string, string> = {};

    for (const membership of ownedMemberships) {
      const wsId = membership.workspace_id;

      // Count the total number of members in this workspace
      const memberCount = await prisma.workspaceMember.count({
        where: { workspace_id: wsId },
      });

      if (memberCount <= 1) {
        // Workspaces with no other members will be deleted
        workspacesToDelete.push(wsId);
      } else {
        // Workspaces with other members require a valid ownership transfer target
        const targetUserId = transfers?.[wsId];
        if (!targetUserId) {
          return NextResponse.json(
            {
              error: `Ownership transfer target is required for workspace "${membership.workspace.name}".`,
            },
            { status: 400 }
          );
        }

        // Verify the transfer target actually belongs to the workspace
        const targetMembership = await prisma.workspaceMember.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: wsId,
              user_id: targetUserId,
            },
          },
        });

        if (!targetMembership) {
          return NextResponse.json(
            {
              error: `Selected transfer user is not a member of workspace "${membership.workspace.name}".`,
            },
            { status: 400 }
          );
        }

        validatedTransfers[wsId] = targetUserId;
      }
    }

    // 5. Generate secure token, record deletion payload, and dispatch verification email
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Expires in 30 minutes

    // Delete any existing deletion token for this user
    await prisma.accountDeletionToken.deleteMany({
      where: { user_id: userId },
    });

    // Create the token with JSON serialized plan
    await prisma.accountDeletionToken.create({
      data: {
        user_id: userId,
        token,
        payload: JSON.stringify({
          transfers: validatedTransfers,
          workspacesToDelete,
        }),
        expires_at: expiresAt,
      },
    });

    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${appUrl}/api/auth/verify-delete-account?token=${token}`;

    await sendAccountDeletionVerificationEmail({
      toEmail: dbUser.email!,
      toName: dbUser.full_name || "there",
      verifyUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE_ACCOUNT_REQUEST_ERROR", error);
    return NextResponse.json(
      { error: "Failed to initiate account deletion request" },
      { status: 500 }
    );
  }
}
