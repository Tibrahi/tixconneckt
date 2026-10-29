import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/** Persist a sensitive-operation audit record. Never throws to callers. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
      ipAddress: input.ipAddress,
    });
  } catch (error) {
    console.error("[audit:failed]", error instanceof Error ? error.message : error);
  }
}
