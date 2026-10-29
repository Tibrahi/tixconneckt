import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { flexibleRecords, groupMembers, type FlexibleRecord } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  applyDocUpdate,
  validateDocSize,
  validateFieldPath,
  validateFieldValue,
} from "@/lib/flexible-records";
import { rateLimit } from "@/lib/rate-limit";
import { getSession, type SessionUser } from "@/lib/session";

async function canRead(
  record: FlexibleRecord,
  user: SessionUser,
): Promise<boolean> {
  if (record.ownerId === user.id || user.role === "admin") return true;
  if (record.visibility === "public") return true;
  if (record.visibility === "group" && record.groupId) {
    const db = getDb();
    const [member] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, record.groupId),
          eq(groupMembers.userId, user.id),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    return Boolean(member);
  }
  return false;
}

function canWrite(record: FlexibleRecord, user: SessionUser): boolean {
  // Only the owner (or an admin) may mutate a record. Group visibility
  // grants read access to members, never write access.
  return record.ownerId === user.id || user.role === "admin";
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [record] = await db
    .select()
    .from(flexibleRecords)
    .where(eq(flexibleRecords.id, id))
    .limit(1);
  if (!record) return apiError("Record not found.", 404);
  if (!(await canRead(record, session.user))) {
    return apiError("You don't have access to this record.", 403);
  }
  return apiOk({ record });
}

const patchSchema = z.object({
  set: z.record(z.string(), z.unknown()).default({}),
  remove: z.array(z.string().min(1).max(256)).max(100).default([]),
  expectedRevision: z.number().int().positive(),
  status: z.enum(["active", "processing", "failed", "archived"]).optional(),
});

/**
 * Targeted JSON update with optimistic concurrency. Unknown sibling fields
 * are preserved; only the listed paths change. The revision check and the
 * write happen in one atomic statement.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("records-write", session.user.id, 60, "10 m");
  if (!rl.allowed) return apiError("Too many changes. Please try again shortly.", 429);

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("Check the updated fields and retry.", 400);

  for (const path of Object.keys(parsed.data.set)) {
    const pathProblem = validateFieldPath(path);
    if (pathProblem) return apiError(`Invalid field "${path}": ${pathProblem}`, 400);
    const valueProblem = validateFieldValue(parsed.data.set[path], 0);
    if (valueProblem) return apiError(`Invalid value for "${path}": ${valueProblem}`, 400);
  }
  for (const path of parsed.data.remove) {
    const pathProblem = validateFieldPath(path);
    if (pathProblem) return apiError(`Invalid field "${path}": ${pathProblem}`, 400);
  }

  const db = getDb();
  const [current] = await db
    .select()
    .from(flexibleRecords)
    .where(eq(flexibleRecords.id, id))
    .limit(1);
  if (!current) return apiError("Record not found.", 404);
  if (!canWrite(current, session.user)) {
    return apiError("Only the record owner can change it.", 403);
  }

  const nextDoc = applyDocUpdate(current.doc ?? {}, {
    set: parsed.data.set,
    remove: parsed.data.remove,
  });
  const sizeProblem = validateDocSize(nextDoc);
  if (sizeProblem) return apiError(sizeProblem, 400);

  const [updated] = await db
    .update(flexibleRecords)
    .set({
      doc: nextDoc,
      revision: current.revision + 1,
      status: parsed.data.status ?? current.status,
    })
    .where(
      and(eq(flexibleRecords.id, id), eq(flexibleRecords.revision, parsed.data.expectedRevision)),
    )
    .returning();
  if (!updated) {
    return apiError(
      "This record changed since you opened it. Refresh to see the latest version, then retry.",
      409,
    );
  }
  return apiOk({ record: updated });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [current] = await db
    .select()
    .from(flexibleRecords)
    .where(eq(flexibleRecords.id, id))
    .limit(1);
  if (!current) return apiError("Record not found.", 404);
  if (!canWrite(current, session.user)) {
    return apiError("Only the record owner can delete it.", 403);
  }
  await db.delete(flexibleRecords).where(eq(flexibleRecords.id, id));
  return apiOk({ deleted: true });
}
