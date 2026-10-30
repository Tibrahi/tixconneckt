import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, organizationVerifications, organizations } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { organizationSchema } from "@/lib/validation";

/** Organization profile: public ones are visible to all; private to the owner. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  const mine = org.ownerId === session.user.id;
  if (org.visibility !== "public" && !mine && session.user.role !== "admin") {
    return apiError("This organization is private.", 403);
  }

  const history =
    mine || session.user.role === "admin"
      ? await db
          .select()
          .from(organizationVerifications)
          .where(eq(organizationVerifications.organizationId, id))
          .orderBy(desc(organizationVerifications.createdAt))
          .limit(20)
      : [];

  return apiOk({
    organization: {
      ...org,
      contactJson: mine || session.user.role === "admin" ? org.contactJson : null,
    },
    verifications: history.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      evidenceCount: (h.evidenceDocumentIds as string[]).length,
      decidedAt: h.decidedAt,
      createdAt: h.createdAt,
    })),
    viewer: { owner: mine },
  });
}

/** Owner updates the profile. Verification status can only change via review. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = organizationSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid organization details.", 400);

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) return apiError("Organization not found.", 404);
  if (org.ownerId !== session.user.id) return apiError("Only the owner can edit this organization.", 403);

  if (parsed.data.logoDocumentId) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, parsed.data.logoDocumentId),
          eq(documents.ownerId, session.user.id),
          eq(documents.module, "organization"),
        ),
      )
      .limit(1);
    if (!doc) return apiError("Logo not found. Upload it as an organization document first.", 400);
  }

  await db
    .update(organizations)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      website: parsed.data.website,
      country: parsed.data.country,
      contactJson: parsed.data.contact ?? org.contactJson,
      visibility: parsed.data.visibility ?? org.visibility,
      logoDocumentId: parsed.data.logoDocumentId === null ? null : (parsed.data.logoDocumentId ?? org.logoDocumentId),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, id));
  return apiOk({ updated: true });
}
