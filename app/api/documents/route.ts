import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { withMigrationRetry } from "@/db/migrate-on-boot";
import { documents, parsingJobs } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import {
  buildStorageKey,
  getDocumentUrl,
  MAX_UPLOAD_BYTES,
  storeUpload,
  validateChatMediaUpload,
  validateOrganizationUpload,
  validateUpload,
} from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const MODULES = ["wallet", "project", "request", "profile", "chat", "organization"] as const;

/** List my uploaded documents and parsing jobs. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  // Metadata only: PostgreSQL-mode rows carry bytes in `data`, which must
  // never be serialized into a list response.
  const docs = await db
    .select({
      id: documents.id,
      ownerId: documents.ownerId,
      ownerType: documents.ownerType,
      module: documents.module,
      filename: documents.filename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      storageKey: documents.storageKey,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.ownerId, session.user.id))
    .orderBy(desc(documents.createdAt))
    .limit(50);
  const jobs = await db
    .select({
      id: parsingJobs.id,
      documentId: parsingJobs.documentId,
      status: parsingJobs.status,
      proposedJson: parsingJobs.proposedJson,
      extractionJson: parsingJobs.extractionJson,
      error: parsingJobs.error,
      destinationType: parsingJobs.destinationType,
      createdAt: parsingJobs.createdAt,
      filename: documents.filename,
    })
    .from(parsingJobs)
    .leftJoin(documents, eq(parsingJobs.documentId, documents.id))
    .where(eq(parsingJobs.requestedBy, session.user.id))
    .orderBy(desc(parsingJobs.createdAt))
    .limit(50);
  return apiOk({ documents: docs, jobs });
}

/**
 * Upload a supporting document: validate type/size/permissions, store the
 * original securely, and open a parsing job. Nothing is auto-approved.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("upload", session.user.id, 20, "1 h");
  if (!rl.allowed) return apiError("Too many uploads. Please try again later.", 429);

  const form = await req.formData();
  const file = form.get("file");
  const docModule = String(form.get("module") ?? "wallet");
  if (!(file instanceof File)) return apiError("No file provided.", 400);
  if (!(MODULES as readonly string[]).includes(docModule)) return apiError("Unknown destination module.", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeBase = file.type.split(";")[0].trim().toLowerCase();
  // Chat additionally accepts voice notes, video clips, and web images.
  // Organizations accept logos (PNG, JPEG, GIF, WebP, SVG) and verification
  // evidence (PDF, TXT, DOCX), with content sniffed against the claim.
  const chatExtra = docModule === "chat" && /^(audio|video)\//.test(mimeBase);
  const chatImage = docModule === "chat" && ["image/gif", "image/webp"].includes(mimeBase);
  const problem =
    docModule === "organization"
      ? validateOrganizationUpload(file.type, file.size, buffer)
      : chatExtra
        ? validateChatMediaUpload(file.type, file.size)
        : chatImage
          ? file.size > MAX_UPLOAD_BYTES
            ? "File is larger than the 10 MB limit."
            : file.size <= 0
              ? "File is empty."
              : null
          : validateUpload(file.type, file.size);
  if (problem) return apiError(problem, 400);

  const key = buildStorageKey(session.user.id, docModule, file.name);
  // Dual-mode store: Neon Object Storage when available, else the bytes in
  // Neon PostgreSQL — uploads no longer 502 when object storage is absent.
  const stored = await storeUpload(key, buffer, file.type);

  const db = getDb();
  // Self-heals once when the schema is behind the code (missing `data`
  // column): applies pending migrations and retries the insert.
  const [doc] = await withMigrationRetry(() =>
    db
      .insert(documents)
      .values({
        ownerId: session.user.id,
        module: docModule,
        filename: file.name.slice(0, 200),
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey: stored.storageKey,
        data: stored.data,
      })
      .returning({ id: documents.id }),
  );
  const [job] = await db
    .insert(parsingJobs)
    .values({
      documentId: doc.id,
      requestedBy: session.user.id,
      status: "pending",
      destinationType: docModule,
    })
    .returning({ id: parsingJobs.id });

  return apiOk({ documentId: doc.id, jobId: job.id }, 201);
}

const textSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  module: z.enum(MODULES),
  destinationType: z.string().max(60).optional(),
  destinationId: z.string().max(80).optional(),
});

/** Submit pasted text (e.g. a transaction message) as a parsing job. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = textSchema.safeParse(body);
  if (!parsed.success) return apiError("Provide the text to parse.", 400);

  const db = getDb();
  const [job] = await db
    .insert(parsingJobs)
    .values({
      requestedBy: session.user.id,
      inputText: parsed.data.text,
      status: "pending",
      destinationType: parsed.data.destinationType ?? parsed.data.module,
      destinationId: parsed.data.destinationId,
    })
    .returning({ id: parsingJobs.id });
  return apiOk({ jobId: job.id }, 201);
}

/** Signed, short-lived download URL for one of my documents. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = z.object({ documentId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);
  const db = getDb();
  const [doc] = await db
    .select({ id: documents.id, storageKey: documents.storageKey, filename: documents.filename })
    .from(documents)
    .where(and(eq(documents.id, parsed.data.documentId), eq(documents.ownerId, session.user.id)))
    .limit(1);
  if (!doc) return apiError("Document not found.", 404);
  const url = await getDocumentUrl(doc);
  return apiOk({ url, filename: doc.filename });
}
