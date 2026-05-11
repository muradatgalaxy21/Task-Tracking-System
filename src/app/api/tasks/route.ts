import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/tasks - Fetch tasks
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get("workspaceId");
  const status = searchParams.get("status");

  try {
    const tasks = await prisma.taskLedger.findMany({
      where: {
        AND: [
          ...(workspace_id ? [{ workspace_id }] : []),
          ...(status ? [{ status }] : []),
        ]
      },
      include: {
        assignee: {
          select: {
            id: true,
            full_name: true,
            email: true,
          }
        },
        sub_tasks: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, assignee_id, workspace_id, estimated_days, priority, max_deadline } = body;

    if (!title || !assignee_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Workspace check removed for simplicity


    const task = await prisma.taskLedger.create({
      data: {
        title,
        description: description || "",
        assignee_id,
        workspace_id,
        estimated_days: estimated_days || 1,
        priority: priority || "Medium",
        max_deadline: max_deadline ? new Date(max_deadline) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days if missing
        status: "Todo",
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/tasks - Batch update or status update
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { task_id, status, multiplier_earned } = await req.json();

    if (!task_id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    // Workspace checks removed for simplicity


    // Role-based status transition logic
    const userRole = session.user.role || "Member";

    if (status === "Completed" && userRole !== "Admin") {
      return NextResponse.json({ error: "Only Admins can mark tasks as Completed" }, { status: 403 });
    }

    if (status && !["Todo", "In Progress", "In Review", "Completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatedTask = await prisma.taskLedger.update({
      where: { task_id },
      data: {
        ...(status ? { status } : {}),
        ...(multiplier_earned !== undefined ? { multiplier_earned } : {}),
        ...(status === "Completed" ? { completed_at: new Date() } : {}),
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
