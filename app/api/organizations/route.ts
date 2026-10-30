import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, organizations } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { organizationSchema } from "@/lib/validation";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

async function logoIsMine(db: ReturnType<typeof getDb>, logoDocumentId: string, ownerId: string) {
  const [doc] = await db
    .select()
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
  const rows = await db
    .select()
    .from(organizations)
    .where(
      or(eq(organizations.visibility, "public"), eq(organizations.ownerId, session.user.id)),
    )
    .orderBy(desc(organizations.createdAt))
    .limit(100);
  return apiOk({
    organizations: rows.map((o) => ({
      ...o,
      contactJson: o.ownerId === session.user.id ? o.contactJson : null,
    })),
  });
}

/** Create an organization profile; the creator owns it. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
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

  const [created] = await db
    .insert(organizations)
    .values({
      ownerId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      website: parsed.data.website,
      country: parsed.data.country,
      contactJson: parsed.data.contact ?? {},
      visibility: parsed.data.visibility ?? "public",
      logoDocumentId: parsed.data.logoDocumentId ?? null,
    })
    .returning({ id: organizations.id });
  return apiOk({ organizationId: created.id }, 201);
}
