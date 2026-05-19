// Audit logging utility — writes to the AuditLog table.
// Import only in server-side code (API routes / Server Components).

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export type AuditEventType =
  | "task_created"
  | "task_deleted"
  | "task_status_change"
  | "task_edited"
  | "task_comment"
  | "user_login"
  | "user_signup";

export interface AuditPayload {
  workspace_id?: string | null;
  user_id?: string | null;
  actor_name: string;
  actor_email?: string | null;
  event_type: AuditEventType;
  entity_id?: string | null;
  entity_name?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(payload: AuditPayload): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        workspace_id: payload.workspace_id ?? null,
        user_id: payload.user_id ?? null,
        actor_name: payload.actor_name,
        actor_email: payload.actor_email ?? null,
        event_type: payload.event_type,
        entity_id: payload.entity_id ?? null,
        entity_name: payload.entity_name ?? null,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      },
    });
  } catch {
    // Audit log failures must never crash the primary operation
  }
}
