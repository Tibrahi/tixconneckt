import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, organizationMembers, organizations } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { organizationSchema } from "@/lib/validation";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

async function logoIsMine(db: ReturnType<typeof getDb>, logoDocumentId: string, ownerId: string) {
  const [doc] = await db
    .select({ id: documents.id, mimeType: documents.mimeType })
    .from(documents)
    .where(
      and(
        eq(documents.id, logoDocumentId),
        eq(documents.ownerId, ownerId),
        eq(documents.module, "organization"),
      ),
    )
    .limit(1);
  if (!doc) return "Logo not found. Upload it as an organization document first.";
  if (!IMAGE_MIMES.has(doc.mimeType.split(";")[0].trim().toLowerCase())) {
    return "The logo must be an image file.";
  }
  return null;
}

/** Public directory plus my own organizations (private ones stay mine). */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const memberships = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, session.user.id), eq(organizationMembers.status, "active")));
  const visibleOwnerIds = [session.user.id];
  const membershipIds = memberships.map((row) => row.organizationId);
  const rows = await db
    .select()
    .from(organizations)
    .where(
      or(
        eq(organizations.visibility, "public"),
        inArray(organizations.ownerId, visibleOwnerIds),
        ...(membershipIds.length > 0 ? [inArray(organizations.id, membershipIds)] : []),
      ),
    )
    .orderBy(desc(organizations.createdAt))
    .limit(100);
  return apiOk({
    organizations: rows.map((o) => ({
      ...o,
      contactJson: o.ownerId === session.user.id || membershipIds.includes(o.id) ? o.contactJson : null,
    })),
  });
}

/** Create an organization profile; the creator owns it. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (session.user.category === "individual" && session.user.role !== "admin") return apiError("Only university, government, and provider accounts can create organization profiles.", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = organizationSchema.safeParse(body);
  if (!parsed.success) return apiError("Give the organization a name (2+ characters).", 400);

  const db = getDb();
  if (parsed.data.logoDocumentId) {
    const problem = await logoIsMine(db, parsed.data.logoDocumentId, session.user.id);
    if (problem) return apiError(problem, 400);
  }

  const created = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({
      ownerId: session.user.id,
      name: parsed.data.name,
      kind: ["university", "government", "provider"].includes(session.user.category) ? session.user.category : null,
      description: parsed.data.description,
      category: parsed.data.category,
      website: parsed.data.website,
      country: parsed.data.country,
      contactJson: parsed.data.contact ?? {},
      visibility: parsed.data.visibility ?? "public",
      logoDocumentId: parsed.data.logoDocumentId ?? null,
    }).returning({ id: organizations.id });
    await tx.insert(organizationMembers).values({ organizationId: org.id, userId: session.user.id, role: "owner", status: "active" });
    return org;
  });
  return apiOk({ organizationId: created.id }, 201);
}
