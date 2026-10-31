import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { authorizeDocumentAccess } from "@/lib/document-access";
import { getSession } from "@/lib/session";
import { getDocumentUrl } from "@/lib/storage";

/**
 * Mint an authorized download URL for a private document: a short-lived
 * signed object URL when object storage holds the file, else the same-origin
 * byte endpoint for PostgreSQL-mode rows. Owners and admins always pass;
 * chat attachments additionally pass for members of a conversation whose
 * live messages reference the file.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [doc] = await db
    .select({
      id: documents.id,
      ownerId: documents.ownerId,
      module: documents.module,
      filename: documents.filename,
      mimeType: documents.mimeType,
      storageKey: documents.storageKey,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!doc) return apiError("Document not found.", 404);
  const denied = await authorizeDocumentAccess(doc, session.user.id, session.user.role);
  if (denied) return apiError(denied.error, denied.status);
  const url = await getDocumentUrl(doc, 300);
  return apiOk({
    url,
    filename: doc.filename,
    mimeType: doc.mimeType,
    expiresInSeconds: doc.storageKey ? 300 : null,
  });
}
