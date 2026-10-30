import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { flexibleRecords, groupMembers } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  applyDocUpdate,
  validateDocSize,
  validateFieldPath,
  validateFieldValue,
  type DocUpdate,
} from "@/lib/flexible-records";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

const RECORD_TYPE_RE = /^[a-z][a-z0-9_]{0,63}$/;
const VISIBILITIES = ["private", "group", "public"] as const;

const createSchema = z.object({
  recordType: z.string().trim().regex(RECORD_TYPE_RE, "Use a lowercase type like digital_project."),
  doc: z.record(z.string(), z.unknown()).default({}),
  visibility: z.enum(VISIBILITIES).default("private"),
  groupId: z.string().min(1).max(128).optional(),
  status: z.enum(["active", "processing", "failed", "archived"]).default("active"),
  provenance: z.record(z.string(), z.unknown()).default({}),
});

function validateDocEntries(doc: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(doc)) {
    const pathProblem = validateFieldPath(key);
    if (pathProblem) return `Invalid field "${key}": ${pathProblem}`;
    const valueProblem = validateFieldValue(value, 0);
    if (valueProblem) return `Invalid value for "${key}": ${valueProblem}`;
  }
  return validateDocSize(doc);
}

/** List records visible to me: mine, public, or shared with my groups. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const recordType = url.searchParams.get("recordType");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  if (recordType && !RECORD_TYPE_RE.test(recordType)) {
    return apiError("Invalid record type.", 400);
  }

  const db = getDb();
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, session.user.id), eq(groupMembers.status, "active")));
  const myGroupIds = memberships.map((m) => m.groupId);
  const isAdmin = session.user.role === "admin";

  // Admins see everything; others see own + public + their groups' records.
  const visibilityFilter = isAdmin
    ? undefined
    : or(
        eq(flexibleRecords.ownerId, session.user.id),
        eq(flexibleRecords.visibility, "public"),
        ...myGroupIds.map((gid) =>
          and(eq(flexibleRecords.visibility, "group"), eq(flexibleRecords.groupId, gid)),
        ),
      );

  const filter = and(
    recordType ? eq(flexibleRecords.recordType, recordType) : undefined,
    visibilityFilter,
  );

  const items = await db
    .select()
    .from(flexibleRecords)
    .where(filter)
    .orderBy(desc(flexibleRecords.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return apiOk({ items, page, pageSize });
}

/**
 * Create a flexible record. Dynamic fields are validated (name, type, size)
 * and stored in JSONB — no schema migration needed for new fields.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("records-write", session.user.id, 60, "10 m");
  if (!rl.allowed) return apiError("Too many changes. Please try again shortly.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError("Check the record type and visibility.", 400);

  const docProblem = validateDocEntries(parsed.data.doc);
  if (docProblem) return apiError(docProblem, 400);
  const provenanceProblem = validateFieldValue(parsed.data.provenance, 0);
  if (provenanceProblem) return apiError("Invalid provenance metadata.", 400);

  const db = getDb();
  if (parsed.data.visibility === "group") {
    if (!parsed.data.groupId) return apiError("Group records need a group.", 400);
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, parsed.data.groupId),
          eq(groupMembers.userId, session.user.id),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!member) return apiError("You are not a member of this group.", 403);
  }

  const [created] = await db
    .insert(flexibleRecords)
    .values({
      recordType: parsed.data.recordType,
      ownerId: session.user.id,
      visibility: parsed.data.visibility,
      groupId: parsed.data.groupId,
      doc: applyDocUpdate({}, { set: parsed.data.doc, remove: [] }),
      status: parsed.data.status,
      provenance: { ...parsed.data.provenance, createdBy: session.user.id },
    })
    .returning();

  return apiOk({ record: created }, 201);
}

export type { DocUpdate };
