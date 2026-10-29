import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { parsingJobs } from "@/db/schema";
import { callMuseSpark } from "@/lib/ai";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { transactionProposalSchema } from "@/lib/validation";

/**
 * Run AI extraction on a parsing job. The result is validated against a Zod
 * schema and parked at needs_review — never trusted blindly.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const db = getDb();
  const [job] = await db
    .select()
    .from(parsingJobs)
    .where(and(eq(parsingJobs.id, id), eq(parsingJobs.requestedBy, session.user.id)))
    .limit(1);
  if (!job) return apiError("Parsing job not found.", 404);
  if (job.status === "approved") return apiError("This job was already approved.", 400);

  await db.update(parsingJobs).set({ status: "processing", error: null }).where(eq(parsingJobs.id, id));

  const spark = await callMuseSpark({
    task: "parse_document",
    input: {
      text: job.inputText,
      documentId: job.documentId,
      destination: job.destinationType,
    },
    schemaHint: "transaction: { amountMinor: int, currency: 3-letter, direction: credit|debit, reference?, description?, occurredAt? }",
  });

  if (!spark.configured) {
    await db
      .update(parsingJobs)
      .set({ status: "pending", error: spark.pendingReason ?? "AI parsing is not configured" })
      .where(eq(parsingJobs.id, id));
    return apiOk({ pending: true, pendingReason: spark.pendingReason });
  }
  if (spark.error || !spark.data) {
    await db.update(parsingJobs).set({ status: "failed", error: spark.error ?? "Extraction failed" }).where(eq(parsingJobs.id, id));
    return apiError(spark.error ?? "Extraction failed. You can retry safely.", 502);
  }

  const validated = transactionProposalSchema.safeParse(spark.data);
  if (!validated.success) {
    await db
      .update(parsingJobs)
      .set({ status: "failed", error: "The AI result did not match the required format." })
      .where(eq(parsingJobs.id, id));
    return apiError("The extracted data was invalid. Correct the values manually instead.", 502);
  }

  await db
    .update(parsingJobs)
    .set({ status: "needs_review", proposedJson: validated.data, error: null })
    .where(eq(parsingJobs.id, id));
  return apiOk({ jobId: id, status: "needs_review", proposed: validated.data });
}

const approveSchema = z.object({
  corrected: transactionProposalSchema.optional(),
});

/**
 * Approve a reviewed proposal (with optional corrections). Returns validated
 * data for the caller to record — approval here does not move money by itself.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid corrections.", 400);

  const db = getDb();
  const [job] = await db
    .select()
    .from(parsingJobs)
    .where(and(eq(parsingJobs.id, id), eq(parsingJobs.requestedBy, session.user.id)))
    .limit(1);
  if (!job) return apiError("Parsing job not found.", 404);
  if (job.status !== "needs_review" || !job.proposedJson) {
    return apiError("This job is not awaiting review.", 400);
  }

  const finalData = parsed.data.corrected ?? transactionProposalSchema.parse(job.proposedJson);
  await db
    .update(parsingJobs)
    .set({ status: "approved", proposedJson: finalData })
    .where(eq(parsingJobs.id, id));
  return apiOk({ jobId: id, approved: finalData });
}
