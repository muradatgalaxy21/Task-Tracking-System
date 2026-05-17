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

    const workspace = await prisma.workspace.findUnique({
      where: { invite_code: inviteCode.trim() },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
    }

    // Prevent duplicate membership
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspace.id,
          user_id: userId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You are already a member of this workspace" },
        { status: 409 }
      );
    }

    await prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: userId,
        role: "Member",
      },
    });

    return NextResponse.json({ workspace });
  } catch (err) {
    console.error("JOIN_WORKSPACE_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
