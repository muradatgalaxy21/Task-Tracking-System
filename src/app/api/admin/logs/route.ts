import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/admin/logs
// Query params: workspace_id, event_type, limit (default 200), offset (default 0)
// Owner-only endpoint.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch role fresh — never trust JWT for admin-only routes
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!dbUser || !hasMinimumRole(dbUser.role, "Admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get("workspace_id") || undefined;
  const event_type   = searchParams.get("event_type") || undefined;
  const limit        = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);
  const offset       = parseInt(searchParams.get("offset") || "0", 10);

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          // "all" or absent = no workspace filter; "auth" = only null workspace (auth events)
          ...(workspace_id === "auth"
            ? { workspace_id: null }
            : workspace_id
            ? { workspace_id }
            : {}),
          ...(event_type ? { event_type } : {}),
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({
        where: {
          ...(workspace_id === "auth"
            ? { workspace_id: null }
            : workspace_id
            ? { workspace_id }
            : {}),
          ...(event_type ? { event_type } : {}),
        },
      }),
    ]);

    // Attach workspace names
    const workspaceIds = [...new Set(logs.map((l) => l.workspace_id).filter(Boolean))] as string[];
    const workspaces = workspaceIds.length
      ? await prisma.workspace.findMany({
          where: { id: { in: workspaceIds } },
          select: { id: true, name: true },
        })
      : [];
    const wsMap = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

    const enriched = logs.map((log) => ({
      ...log,
      workspace_name: log.workspace_id ? (wsMap[log.workspace_id] ?? "Unknown Workspace") : null,
    }));

    return NextResponse.json({ logs: enriched, total });
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
