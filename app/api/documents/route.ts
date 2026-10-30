import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { documents, parsingJobs } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import {
  buildStorageKey,
  MAX_UPLOAD_BYTES,
  uploadPrivateObject,
  validateChatMediaUpload,
  validateUpload,
} from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const MODULES = ["wallet", "project", "request", "profile", "chat"] as const;

/** List my uploaded documents and parsing jobs. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.ownerId, session.user.id))
    .orderBy(desc(documents.createdAt))
    .limit(50);
  const jobs = await db
    .select()
    .from(parsingJobs)
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

  // Chat additionally accepts voice notes, video clips, and web images.
  const chatExtra =
    docModule === "chat" &&
    /^(audio|video)\//.test(file.type.split(";")[0].trim().toLowerCase());
  const chatImage =
    docModule === "chat" && ["image/gif", "image/webp"].includes(file.type.split(";")[0].trim().toLowerCase());
  const problem = chatExtra
    ? validateChatMediaUpload(file.type, file.size)
    : chatImage
      ? file.size > MAX_UPLOAD_BYTES
        ? "File is larger than the 10 MB limit."
        : file.size <= 0
          ? "File is empty."
          : null
      : validateUpload(file.type, file.size);
  if (problem) return apiError(problem, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildStorageKey(session.user.id, docModule, file.name);
  const uploaded = await uploadPrivateObject(key, buffer, file.type);
  if (!uploaded.ok) {
    return apiError(
      uploaded.error === "Object storage is not configured"
        ? "Document storage is pending configuration. Your file was not saved."
        : "We couldn't store your file. Please try again.",
      502,
    );
  }

  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: session.user.id,
      module: docModule,
      filename: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      storageKey: key,
    })
    .returning({ id: documents.id });
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
    .select()
    .from(documents)
    .where(and(eq(documents.id, parsed.data.documentId), eq(documents.ownerId, session.user.id)))
    .limit(1);
  if (!doc) return apiError("Document not found.", 404);
  const { getPrivateObjectUrl } = await import("@/lib/storage");
  const url = await getPrivateObjectUrl(doc.storageKey);
  if (!url) return apiError("Document storage is unavailable.", 502);
  return apiOk({ url, filename: doc.filename });
}
