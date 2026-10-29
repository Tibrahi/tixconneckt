import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { legalDocuments } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { LEGAL_DOCUMENTS } from "@/lib/legal-content";

/** Serve the current version of a legal document (public, for consent flows). */
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (type !== "privacy" && type !== "terms" && type !== "agreement") {
    return apiError("Unknown document.", 404);
  }
  const fallback = LEGAL_DOCUMENTS.find((d) => d.type === type)!;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.type, type));
    const current =
      rows.find((r) => r.version === fallback.version) ?? rows[0] ?? null;
    if (current) {
      return apiOk({ type, title: current.title, version: current.version, body: current.body });
    }
  } catch {
    /* fall through to bundled copy */
  }
  return apiOk({ type, title: fallback.title, version: fallback.version, body: fallback.body });
}
