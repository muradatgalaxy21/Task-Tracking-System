import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/settings/delete-account/status
// Analyzes workspaces owned by the user and determines if they need to be deleted or transferred.
// Also checks if the user is the sole global Owner of the system.
export async function GET() {
  // 1. Authenticate user and retrieve session
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // 2. Fetch the user's global role to check if they are the Owner
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 3. Determine if the user is the sole global Owner of the system
    let isSoleGlobalOwner = false;
    if (user.role === "Owner") {
      const ownerCount = await prisma.user.count({
        where: { role: "Owner" },
      });
      isSoleGlobalOwner = ownerCount === 1;
    }

    // 4. Find all workspaces where this user holds the Owner role
    const ownedMemberships = await prisma.workspaceMember.findMany({
      where: {
        user_id: userId,
        role: "Owner",
      },
      include: {
        workspace: true,
      },
    });

    const deletedWorkspaces: { id: string; name: string }[] = [];
    const transferWorkspaces: {
      id: string;
      name: string;
      members: { id: string; full_name: string | null; email: string | null }[];
    }[] = [];

    // 5. Categorize each owned workspace by whether it needs ownership transfer or deletion
    for (const membership of ownedMemberships) {
      const workspaceId = membership.workspace_id;
      const workspaceName = membership.workspace.name;

      // Count the total number of members in this workspace
      const memberCount = await prisma.workspaceMember.count({
        where: { workspace_id: workspaceId },
      });

      if (memberCount <= 1) {
        // If there are no other members, the workspace will be deleted
        deletedWorkspaces.push({ id: workspaceId, name: workspaceName });
      } else {
        // If there are other members, retrieve their details for the transfer dropdown list
        const otherMembers = await prisma.workspaceMember.findMany({
          where: {
            workspace_id: workspaceId,
            user_id: { not: userId },
          },
          include: {
            user: {
              select: {
                id: true,
                full_name: true,
                email: true,
              },
            },
          },
        });

        transferWorkspaces.push({
          id: workspaceId,
          name: workspaceName,
          members: otherMembers.map((m) => m.user),
        });
      }
    }

    return NextResponse.json({
      isSoleGlobalOwner,
      deletedWorkspaces,
      transferWorkspaces,
    });
  } catch (error) {
    console.error("DELETE_ACCOUNT_STATUS_ERROR", error);
    return NextResponse.json(
      { error: "Failed to fetch account deletion status" },
      { status: 500 }
    );
  }
}
