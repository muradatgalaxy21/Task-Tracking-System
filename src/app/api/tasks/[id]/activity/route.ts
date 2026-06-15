import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse, after } from "next/server";
import { sendMentionEmail } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/tasks/[id]/activity - Fetch all activity for a task, oldest first
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const activities = await prisma.taskActivity.findMany({
      where: { task_id: id },
      orderBy: { created_at: "asc" },
    });
    return NextResponse.json(activities);
  } catch (error) {
    console.error("Failed to fetch activity:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/tasks/[id]/activity - Add a comment; parses @mentions to create notifications
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { content, type = "comment" } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { full_name: true, email: true },
    });

    const actor_name = dbUser?.full_name || dbUser?.email || "Unknown";

    // Save the comment
    const activity = await prisma.taskActivity.create({
      data: {
        task_id: id,
        user_id: session.user.id,
        actor_name,
        type,
        content: content.trim(),
      },
    });

    // Process @mention notifications only for comment-type entries
    if (type === "comment") {
      await processMentions({
        taskId: id,
        content: content.trim(),
        actorName: actor_name,
        actorId: session.user.id,
      });

      // Audit log for comment — fetch task workspace + title
      const taskMeta = await prisma.taskLedger.findUnique({
        where: { task_id: id },
        select: { workspace_id: true, title: true },
      });
      writeAuditLog({
        workspace_id: taskMeta?.workspace_id,
        user_id: session.user.id,
        actor_name,
        actor_email: dbUser?.email,
        event_type: "task_comment",
        entity_id: id,
        entity_name: taskMeta?.title,
        metadata: { preview: content.trim().slice(0, 120) },
      });
    }

    return NextResponse.json(activity);
  } catch (error) {
    console.error("Failed to create activity:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Parses @FirstName tokens from a comment and creates in-app notifications + sends emails
async function processMentions({
  taskId,
  content,
  actorName,
  actorId,
}: {
  taskId: string;
  content: string;
  actorName: string;
  actorId: string;
}) {
  // Extract unique first names mentioned (e.g. "@Murad" -> "murad")
  const rawMatches = content.match(/@(\w+)/g) ?? [];
  const mentionedNames = new Set(rawMatches.map((m) => m.slice(1).toLowerCase()));

  if (mentionedNames.size === 0) return;

  // Fetch the task's workspace and title so we can scope member lookup
  const task = await prisma.taskLedger.findUnique({
    where: { task_id: taskId },
    select: { workspace_id: true, title: true },
  });

  if (!task?.workspace_id) return;

  // Load all workspace members to match @first-name patterns
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspace_id: task.workspace_id },
    include: {
      user: { select: { id: true, full_name: true, email: true } },
    },
  });

  // Resolve which workspace members are actually mentioned and not the author
  const mentioned = workspaceMembers
    .map(({ user }) => user)
    .filter((user) => {
      const firstName = user.full_name?.split(" ")[0]?.toLowerCase() ?? "";
      return mentionedNames.has(firstName) && user.id !== actorId;
    });

  if (mentioned.length === 0) return;

  // Write all notification rows in a single round-trip rather than one per mention
  await prisma.notification.createMany({
    data: mentioned.map((user) => ({
      user_id: user.id,
      task_id: taskId,
      task_title: task.title,
      from_name: actorName,
      type: "mention",
      message: `${actorName} mentioned you in "${task.title}"`,
    })),
  });

  // Send mention emails after the response is returned so Resend calls never delay
  // the comment save. Emails are sent individually — no batch send API available.
  // sendMentionEmail logs and swallows its own errors.
  after(async () => {
    for (const user of mentioned) {
      if (user.email) {
        await sendMentionEmail({
          toEmail: user.email,
          toName: user.full_name || user.email.split("@")[0],
          fromName: actorName,
          taskTitle: task.title,
          commentPreview: content.slice(0, 200),
        });
      }
    }
  });
}
