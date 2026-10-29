import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { getPrivateObjectUrl } from "@/lib/storage";

/**
 * Mint a short-lived, owner-checked download URL for a private document.
 * File references in flexible JSON render through this endpoint so object
 * storage stays private and every access is authorized.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return apiError("Document not found.", 404);
  if (doc.ownerId !== session.user.id && session.user.role !== "admin") {
    return apiError("You don't have access to this document.", 403);
  }
  const url = await getPrivateObjectUrl(doc.storageKey, 300);
  if (!url) return apiError("Document storage is unavailable.", 502);
  return apiOk({
    url,
    filename: doc.filename,
    mimeType: doc.mimeType,
    expiresInSeconds: 300,
  });
}
