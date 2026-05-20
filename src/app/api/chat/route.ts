import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat - Retrieve workspace chat messages
 * 1. Validate user authentication session
 * 2. Verify user is a member of the requested workspace
 * 3. Query ChatMessage records ordered by created_at (optionally since a timestamp)
 * 4. Return serialized messages list
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const since = searchParams.get("since");

  if (!workspaceId) {
    return NextResponse.json(
      { error: "Workspace ID is required" },
      { status: 400 }
    );
  }

  try {
    // 1. Verify user is a member of the requested workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You do not have access to this workspace's chat" },
        { status: 403 }
      );
    }

    // 2. Build database query conditions
    const whereConditions: any = {
      workspace_id: workspaceId,
    };

    // 3. Add incremental polling filter if 'since' parameter is provided
    if (since) {
      whereConditions.created_at = {
        gt: new Date(since),
      };
    }

    // 4. Retrieve messages including sender profile details
    const messages = await prisma.chatMessage.findMany({
      where: whereConditions,
      orderBy: {
        created_at: "asc",
      },
      take: since ? undefined : 100, // Return last 100 messages on initial load
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(messages);
  } catch (err) {
    console.error("GET_CHAT_MESSAGES_ERROR", err);
    return NextResponse.json(
      { error: "Failed to retrieve chat messages. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat - Send a workspace chat message
 * 1. Validate user session
 * 2. Parse request payload (content, attachments, workspaceId)
 * 3. Verify workspace membership
 * 4. Create ChatMessage database record
 * 5. Return newly created message with sender info
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Parse request body
    const { content, attachments, workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // 2. Validate that message has either content or attachments
    const hasContent = content && content.trim().length > 0;
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      return NextResponse.json(
        { error: "Message cannot be empty. Send text or attach a file." },
        { status: 400 }
      );
    }

    // 3. Verify workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You cannot post messages to a workspace you do not belong to" },
        { status: 403 }
      );
    }

    // 4. Create the ChatMessage in the database
    const message = await prisma.chatMessage.create({
      data: {
        workspace_id: workspaceId,
        user_id: session.user.id,
        content: content ? content.trim() : "",
        attachments: attachments ? JSON.stringify(attachments) : "[]",
      },
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(message);
  } catch (err) {
    console.error("POST_CHAT_MESSAGE_ERROR", err);
    return NextResponse.json(
      { error: "Failed to send chat message. Please try again." },
      { status: 500 }
    );
  }
}
