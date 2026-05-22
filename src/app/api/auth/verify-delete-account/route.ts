import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/auth/verify-delete-account?token=XXX
// Executes account deletion and transfers based on the pre-validated plan in the token.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const settingsUrl = `${appUrl}/dashboard/settings`;
  const deletedPageUrl = `${appUrl}/auth/account-deleted`;

  if (!token) {
    return NextResponse.redirect(`${settingsUrl}?deleteVerify=invalid`);
  }

  try {
    // 1. Fetch and validate the deletion token
    const record = await prisma.accountDeletionToken.findUnique({
      where: { token },
    });

    if (!record || record.expires_at < new Date()) {
      if (record) {
        await prisma.accountDeletionToken.delete({ where: { token } });
      }
      return NextResponse.redirect(`${settingsUrl}?deleteVerify=expired`);
    }

    // 2. Parse the verified deletion plan payload
    let payload: {
      transfers: Record<string, string>;
      workspacesToDelete: string[];
    };

    try {
      payload = JSON.parse(record.payload);
    } catch {
      await prisma.accountDeletionToken.delete({ where: { token } });
      return NextResponse.redirect(`${settingsUrl}?deleteVerify=invalid`);
    }

    const userId = record.user_id;

    // 3. Execute all deletion, transfer, and cleanup operations in a single database transaction
    await prisma.$transaction(async (tx) => {
      // A. Transfer ownership of specified workspaces
      for (const [wsId, targetUserId] of Object.entries(payload.transfers)) {
        // Promote the target user to Owner of the workspace
        await tx.workspaceMember.update({
          where: {
            workspace_id_user_id: {
              workspace_id: wsId,
              user_id: targetUserId,
            },
          },
          data: { role: "Owner" },
        });

        // Set the workspace creator/creator-owner relationship to the target user
        await tx.workspace.update({
          where: { id: wsId },
          data: { created_by: targetUserId },
        });
      }

      // B. Clean up tasks and delete workspaces marked for deletion (workspaces with no other members)
      for (const wsId of payload.workspacesToDelete) {
        // Delete task activities and sub-tasks first to satisfy foreign keys if needed,
        // then delete the tasks themselves.
        const tasks = await tx.taskLedger.findMany({
          where: { workspace_id: wsId },
          select: { task_id: true },
        });
        const taskIds = tasks.map((t) => t.task_id);

        if (taskIds.length > 0) {
          await tx.subTask.deleteMany({
            where: { parent_task_id: { in: taskIds } },
          });
          await tx.taskActivity.deleteMany({
            where: { task_id: { in: taskIds } },
          });
          await tx.taskLedger.deleteMany({
            where: { workspace_id: wsId },
          });
        }

        // Delete the workspace record (cascades to WorkspaceMember, Page, Invitation, ChatMessage)
        await tx.workspace.delete({
          where: { id: wsId },
        });
      }

      // C. Clean up any loose tokens (profile verify tokens) and delete the User record
      await tx.profileVerificationToken.deleteMany({
        where: { user_id: userId },
      });

      await tx.user.delete({
        where: { id: userId },
      });

      // D. Clean up the used deletion token
      await tx.accountDeletionToken.delete({
        where: { token },
      });
    }, { timeout: 30000 });

    // 4. Redirect to the goodbye page
    return NextResponse.redirect(deletedPageUrl);
  } catch (error) {
    console.error("VERIFY_DELETE_ACCOUNT_ERROR", error);
    return NextResponse.redirect(`${settingsUrl}?deleteVerify=error`);
  }
}
