import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveRole, hasMinimumRole } from "@/lib/rbac-utils";
import { revalidateMembers } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/permissions?workspaceId=X
 * Returns all custom permission overrides for members in the selected workspace.
 * Scoped to Owner role.
 *
 * 1. Authenticate caller session.
 * 2. Verify caller has Owner permissions in workspace.
 * 3. Fetch override records from database.
 */
export async function GET(req: Request) {
  // 1. Authenticate caller session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  try {
    // 2. Fetch membership role and determine caller effective role.
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    const globalRole = session.user.role || "Member";
    const effectiveRole = resolveEffectiveRole(globalRole, membership?.role);

    // Verify Owner privilege.
    if (!hasMinimumRole(effectiveRole, "Owner")) {
      return NextResponse.json({ error: "Forbidden: Owner role required" }, { status: 403 });
    }

    // 3. Retrieve all permission overrides.
    const overrides = await prisma.memberPermission.findMany({
      where: { workspace_id: workspaceId },
    });

    return NextResponse.json(overrides);
  } catch (error) {
    console.error("Failed to fetch permissions:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/permissions
 * Creates, updates, or deletes a permission override.
 * Scoped to Owner role.
 *
 * 1. Authenticate caller session.
 * 2. Verify caller has Owner permissions in workspace.
 * 3. If allowed is null, delete override setting from database (falls back to default).
 * 4. If allowed is boolean, upsert override setting in database.
 */
export async function POST(req: Request) {
  // 1. Authenticate session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, userId, permission, allowed } = await req.json();

    if (!workspaceId || !userId || !permission) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 2. Determine caller effective role inside target workspace.
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    const globalRole = session.user.role || "Member";
    const effectiveRole = resolveEffectiveRole(globalRole, membership?.role);

    // Verify Owner privilege.
    if (!hasMinimumRole(effectiveRole, "Owner")) {
      return NextResponse.json({ error: "Forbidden: Owner role required" }, { status: 403 });
    }

    // 3. Check if we should delete (Inherit default role setting).
    if (allowed === null) {
      await prisma.memberPermission.deleteMany({
        where: {
          workspace_id: workspaceId,
          user_id: userId,
          permission,
        },
      });
      // Invalidate members cache.
      revalidateMembers();
      return NextResponse.json({ success: true, deleted: true });
    }

    // 4. Otherwise, upsert the dynamic override.
    const upserted = await prisma.memberPermission.upsert({
      where: {
        workspace_id_user_id_permission: {
          workspace_id: workspaceId,
          user_id: userId,
          permission,
        },
      },
      update: {
        allowed,
      },
      create: {
        workspace_id: workspaceId,
        user_id: userId,
        permission,
        allowed,
      },
    });

    // Invalidate members cache.
    revalidateMembers();
    return NextResponse.json({ success: true, override: upserted });
  } catch (error) {
    console.error("Failed to upsert permission override:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
