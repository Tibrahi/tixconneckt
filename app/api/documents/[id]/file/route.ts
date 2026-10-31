import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { documents } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { authorizeDocumentAccess } from "@/lib/document-access";
import { getSession } from "@/lib/session";
import { resolveStoredBytes } from "@/lib/storage";

/**
 * Stream a private document's bytes in either storage mode: Neon Object
 * Storage when the row has a key, else Neon PostgreSQL. Authorization is the
 * same shared check as the signed-URL endpoint, so PostgreSQL-mode files
 * (uploads made while object storage was unconfigured) resolve everywhere
 * a signed URL would — organization logos, chat attachments, project files.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [doc] = await withMigrationRetry(() =>
    db.select().from(documents).where(eq(documents.id, id)).limit(1),
  );
  if (!doc) return apiError("Document not found.", 404);
  const denied = await authorizeDocumentAccess(doc, session.user.id, session.user.role);
  if (denied) return apiError(denied.error, denied.status);
  const stored = await resolveStoredBytes(doc.storageKey, doc.data, doc.mimeType);
  if (!stored) return apiError("Document storage is unavailable.", 502);
  const body = stored.body.buffer.slice(
    stored.body.byteOffset,
    stored.body.byteOffset + stored.body.byteLength,
  ) as ArrayBuffer;
  const safeName = doc.filename.replace(/["\r\n]/g, "_").slice(0, 180) || "file";
  const headers: Record<string, string> = {
    "Content-Type": stored.contentType ?? doc.mimeType,
    "Content-Length": String(stored.body.byteLength),
    "Content-Disposition": `inline; filename="${safeName}"`,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  // SVG logos render from this origin: sandbox them so embedded scripts can
  // never run in the application's context.
  if ((stored.contentType ?? doc.mimeType).split(";")[0].trim().toLowerCase() === "image/svg+xml") {
    headers["Content-Security-Policy"] = "sandbox";
  }
  return new Response(body, { headers });
}
