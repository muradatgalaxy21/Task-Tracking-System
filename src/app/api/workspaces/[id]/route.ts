import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole, resolveEffectiveRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

// PATCH /api/workspaces/[id] - Update workspace name or description (workspace Admin/Owner only)
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
    const { name, description } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: id, user_id: session.user.id } },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }

    const effectiveRole = resolveEffectiveRole(session.user.role || "Member", membership.role);

    if (!hasMinimumRole(effectiveRole, "Admin")) {
      return NextResponse.json({ error: "Requires workspace Admin role" }, { status: 403 });
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim() ?? "",
      },
    });

    return NextResponse.json(workspace);
  } catch (err) {
    console.error("PATCH_WORKSPACE_ERROR", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
