import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/rbac";
import { resolveEffectiveRole } from "@/lib/rbac-utils";
import { STATUS_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

// Returns the WorkspaceMember record or null if the user is not in the workspace.
async function getWorkspaceMembership(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
  });
}

// GET /api/tasks?workspaceId=X - Fetch tasks scoped to the active workspace
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get("workspaceId");
  const status       = searchParams.get("status");

  // Return empty rather than leaking cross-workspace data when no workspace is selected
  if (!workspace_id) {
    return NextResponse.json([]);
  }

  const membership = await getWorkspaceMembership(workspace_id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  try {
    const tasks = await prisma.taskLedger.findMany({
      where: {
        workspace_id,
        ...(status ? { status } : {}),
      },
      include: {
        assignee: { select: { id: true, full_name: true, email: true } },
        sub_tasks: true,
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task (Manager or above only)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      title,
      description,
      assignee_id,
      workspace_id,
      estimated_days,
      priority,
      max_deadline,
      ai_model_used,
      benchmark_score,
      repo_link,
    } = body;

    if (!title || !assignee_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const globalRole = session.user.role || "Member";
    let effectiveRole = globalRole;

    if (workspace_id) {
      const membership = await getWorkspaceMembership(workspace_id, session.user.id);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    // Only Managers and above can create tasks
    if (!hasMinimumRole(effectiveRole, "Manager")) {
      return NextResponse.json(
        { error: "Only Managers and above can create tasks" },
        { status: 403 }
      );
    }

    const task = await prisma.taskLedger.create({
      data: {
        title,
        description: description || "",
        assignee_id,
        workspace_id: workspace_id || null,
        estimated_days: estimated_days || 1,
        priority: priority || "Medium",
        max_deadline: max_deadline
          ? new Date(max_deadline)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "Todo",
        ai_model_used: ai_model_used || null,
        benchmark_score: benchmark_score || null,
        repo_link: repo_link || null,
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/tasks - Update task fields with granular permission checks
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      task_id,
      title,
      status,
      multiplier_earned,
      description,
      ai_model_used,
      benchmark_score,
      repo_link,
      technical_requirements,
      architecture_notes,
      estimated_hours,
      actual_hours,
      attachments,
    } = body;

    if (!task_id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const globalRole = session.user.role || "Member";

    const currentTask = await prisma.taskLedger.findUnique({
      where: { task_id },
      select: { status: true, workspace_id: true, assignee_id: true },
    });

    if (!currentTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Resolve effective role (workspace role takes precedence if higher)
    let effectiveRole = globalRole;
    if (currentTask.workspace_id) {
      const membership = await getWorkspaceMembership(currentTask.workspace_id, session.user.id);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    const isAssignee = currentTask.assignee_id === session.user.id;
    const isAdmin    = hasMinimumRole(effectiveRole, "Admin");
    const isManager  = hasMinimumRole(effectiveRole, "Manager");

    // Review lock: only Admins can make any change once a task is In Review
    if (currentTask.status === "In Review" && !isAdmin) {
      return NextResponse.json(
        { error: "This task is locked for review. Only Admins can make changes." },
        { status: 403 }
      );
    }

    // Title editing is restricted to Managers and above
    if (title !== undefined && !isManager) {
      return NextResponse.json(
        { error: "Only Managers and above can edit the task title" },
        { status: 403 }
      );
    }

    // Metadata editing (description, notes, etc.) requires at least Member rank,
    // and only the assignee or an Admin can do it
    const isEditingMetadata = [
      description, technical_requirements, architecture_notes,
      estimated_hours, actual_hours, attachments, ai_model_used,
      benchmark_score, repo_link,
    ].some((v) => v !== undefined);

    if (isEditingMetadata && !isAdmin && !isAssignee) {
      return NextResponse.json(
        { error: "Only the assignee or an Admin can edit task metadata" },
        { status: 403 }
      );
    }

    // Status transition rules
    if (status !== undefined) {
      const validStatuses = ["Todo", "In Progress", "In Review", "Completed", "Discarded"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      // Only Admin/Owner can move to Completed or Discarded (terminal states)
      if ((status === "Completed" || status === "Discarded") && !isAdmin) {
        return NextResponse.json(
          { error: "Only Admins and Owners can set Completed or Discarded status" },
          { status: 403 }
        );
      }
    }

    const updatedTask = await prisma.taskLedger.update({
      where: { task_id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(multiplier_earned !== undefined ? { multiplier_earned } : {}),
        ...(status === "Completed" ? { completed_at: new Date() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(ai_model_used !== undefined ? { ai_model_used: ai_model_used || null } : {}),
        ...(benchmark_score !== undefined ? { benchmark_score: benchmark_score || null } : {}),
        ...(repo_link !== undefined ? { repo_link: repo_link || null } : {}),
        ...(technical_requirements !== undefined ? { technical_requirements } : {}),
        ...(architecture_notes !== undefined ? { architecture_notes } : {}),
        ...(estimated_hours !== undefined ? { estimated_hours: estimated_hours !== null ? Number(estimated_hours) : null } : {}),
        ...(actual_hours !== undefined ? { actual_hours: actual_hours !== null ? Number(actual_hours) : null } : {}),
        ...(attachments !== undefined ? { attachments } : {}),
      },
    });

    // Auto-log status transitions to the activity feed
    if (status !== undefined && currentTask.status !== status) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { full_name: true, email: true },
      });
      const actor_name = dbUser?.full_name || dbUser?.email || "Unknown";
      const fromLabel  = STATUS_LABELS[currentTask.status] ?? currentTask.status;
      const toLabel    = STATUS_LABELS[status] ?? status;

      await prisma.taskActivity.create({
        data: {
          task_id,
          user_id: session.user.id,
          actor_name,
          type: "status_change",
          content: `moved this task from "${fromLabel}" to "${toLabel}"`,
          metadata: JSON.stringify({ old_status: currentTask.status, new_status: status }),
        },
      });
    }

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/tasks?id=<task_id>
// Rules:
//   - Admins/Owners can always delete.
//   - Assignees (Member or Manager) can delete only if the task is not yet In Review/Completed/Discarded.
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
  }

  try {
    const task = await prisma.taskLedger.findUnique({
      where: { task_id: id },
      select: { workspace_id: true, assignee_id: true, status: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const globalRole = session.user.role || "Member";
    let effectiveRole = globalRole;

    if (task.workspace_id) {
      const membership = await getWorkspaceMembership(task.workspace_id, session.user.id);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    const isAdmin    = hasMinimumRole(effectiveRole, "Admin");
    const isManager  = hasMinimumRole(effectiveRole, "Manager");
    const isAssignee = task.assignee_id === session.user.id;
    // Deletion is locked once the task enters review or a terminal state
    const isLocked   = ["In Review", "Completed", "Discarded"].includes(task.status);

    if (!isAdmin) {
      // Members cannot delete tasks at all; Managers can delete their own unlocked tasks
      if (!isManager || !isAssignee || isLocked) {
        return NextResponse.json(
          { error: "Deletion is not permitted for this task at its current status" },
          { status: 403 }
        );
      }
    }

    await prisma.taskLedger.delete({ where: { task_id: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
