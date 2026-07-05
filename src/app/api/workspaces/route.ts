import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/workspaces - Fetch all workspaces the current user belongs to,
// including the user's local workspace role (member_role) and permission overrides in each item.
export async function GET() {
  // 1. Authenticate the user session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Fetch memberships along with workspaces.
    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: session.user.id },
      include: {
        workspace: { include: { pages: true } },
      },
      orderBy: { workspace: { created_at: "desc" } },
    });

    // 3. Query all custom member permissions for the current user.
    const userPermissions = await prisma.memberPermission.findMany({
      where: { user_id: session.user.id },
    });

    // 4. Merge custom permission overrides into the workspace objects.
    const workspaces = memberships.map((m) => {
      const overrides: Record<string, boolean> = {};
      userPermissions
        .filter((p) => p.workspace_id === m.workspace_id)
        .forEach((p) => {
          overrides[p.permission] = p.allowed;
        });

      return {
        ...m.workspace,
        member_role: m.role,
        permissions: overrides,
      };
    });

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/workspaces - Create a new workspace; creator receives the Owner role
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        description: description || "",
        created_by: session.user.id,
        invite_code: randomUUID(),
        members: {
          create: { user_id: session.user.id, role: "Owner" },
        },
      },
    });

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("Failed to create workspace:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
