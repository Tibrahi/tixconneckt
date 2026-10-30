import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, organizationVerifications, organizations } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { verificationDecisionSchema, verificationSubmitSchema } from "@/lib/validation";

/**
 * Owner submits verification evidence. Each submission re-opens the review
 * (status → pending) and preserves the full decision history.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = verificationSubmitSchema.safeParse(body);
  if (!parsed.success) return apiError("Attach at least one evidence document.", 400);

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  if (org.ownerId !== session.user.id) return apiError("Only the owner can request verification.", 403);

  const owned = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        inArray(documents.id, parsed.data.evidenceDocumentIds),
        eq(documents.ownerId, session.user.id),
        eq(documents.module, "organization"),
      ),
    );
  if (owned.length !== parsed.data.evidenceDocumentIds.length) {
    return apiError("Some evidence files were not found. Upload them as organization documents.", 400);
  }

  const [created] = await db
    .insert(organizationVerifications)
    .values({
      organizationId: id,
      evidenceDocumentIds: parsed.data.evidenceDocumentIds,
      note: parsed.data.note,
      status: "pending",
    })
    .returning({ id: organizationVerifications.id });
  await db
    .update(organizations)
    .set({ verificationStatus: "pending", updatedAt: new Date() })
    .where(eq(organizations.id, id));
  return apiOk({ verificationId: created.id }, 201);
}

/**
 * Admins grant or refuse verification. Rejections require a reason, which
 * the owner sees on the organization profile.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (session.user.role !== "admin") return apiError("Only admins review verifications.", 403);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = verificationDecisionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);
  if (parsed.data.decision === "rejected" && !parsed.data.reason?.trim()) {
    return apiError("A rejection needs a reason.", 400);
  }

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  const [row] = await db
    .select()
    .from(organizationVerifications)
    .where(
      and(
        eq(organizationVerifications.id, parsed.data.verificationId),
        eq(organizationVerifications.organizationId, id),
        eq(organizationVerifications.status, "pending"),
      ),
    )
    .limit(1);
  if (!row) return apiError("Verification request not found or already decided.", 404);

  await db
    .update(organizationVerifications)
    .set({
      status: parsed.data.decision,
      reviewerId: session.user.id,
      decidedAt: new Date(),
      note: parsed.data.reason ?? row.note,
    })
    .where(eq(organizationVerifications.id, row.id));
  await db
    .update(organizations)
    .set({
      verificationStatus: parsed.data.decision === "approved" ? "verified" : "unverified",
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id));

  await notify({
    userId: org.ownerId,
    type: "organization",
    title:
      parsed.data.decision === "approved" ? `"${org.name}" is verified` : `"${org.name}" verification declined`,
    body: parsed.data.reason,
    resourceType: "organization",
    resourceId: id,
  });
  return apiOk({ decided: parsed.data.decision });
}
