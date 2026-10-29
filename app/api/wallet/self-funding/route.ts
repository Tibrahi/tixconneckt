import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { parsingJobs } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";
import { transactionProposalSchema } from "@/lib/validation";
import { z } from "zod";
import { decideEntry, ensureWallet, recordPendingEntry } from "@/lib/wallet";

const selfFundingSchema = z.object({
  currency: z.string().trim().length(3).default("USD"),
  transaction: transactionProposalSchema,
  documentId: z.string().min(1).optional(),
  parsingJobId: z.string().min(1).optional(),
});

/**
 * Individual self-funding step 1: record a PENDING entry from a reviewed
 * proposal. The user must explicitly confirm (PATCH approve) before the
 * balance changes — unverified proposals never move money.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = selfFundingSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid amount and currency.", 400);

  const db = getDb();
  const wallet = await ensureWallet("user", session.user.id, parsed.data.currency);

  if (parsed.data.parsingJobId) {
    const [job] = await db
      .select()
      .from(parsingJobs)
      .where(
        and(eq(parsingJobs.id, parsed.data.parsingJobId), eq(parsingJobs.requestedBy, session.user.id)),
      )
      .limit(1);
    if (!job) return apiError("Supporting document job not found.", 404);
    await db.update(parsingJobs).set({ status: "approved" }).where(eq(parsingJobs.id, job.id));
  }

  const entry = await recordPendingEntry({
    walletId: wallet.id,
    direction: parsed.data.transaction.direction,
    amountMinor: parsed.data.transaction.amountMinor,
    currency: parsed.data.transaction.currency,
    kind: "self_funding",
    metadata: {
      description: parsed.data.transaction.description,
      occurredAt: parsed.data.transaction.occurredAt,
    },
    documentId: parsed.data.documentId,
    createdBy: session.user.id,
  });

  await audit({
    actorId: session.user.id,
    action: "wallet.self_funding.record",
    targetType: "ledger_entry",
    targetId: entry.id,
    ipAddress: clientIp(req),
  });

  return apiOk(entry, 201);
}

const decideSchema = z.object({
  entryId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/**
 * Self-funding step 2: the owner confirms (or rejects) their own pending
 * entry. Only the owner can confirm individual entries.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);

  const db = getDb();
  const { ledgerEntries, wallets } = await import("@/db/schema");
  const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, parsed.data.entryId)).limit(1);
  if (!entry) return apiError("Transaction not found.", 404);
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
  if (!wallet || wallet.ownerType !== "user" || wallet.ownerId !== session.user.id) {
    return apiError("You can only confirm your own individual transactions.", 403);
  }
  if (entry.kind !== "self_funding") {
    return apiError("Only self-funding entries can be confirmed here.", 400);
  }

  try {
    const result = await decideEntry({
      entryId: entry.id,
      decision: parsed.data.decision,
      actorId: session.user.id,
      reason: parsed.data.decision === "approved" ? "Owner verified and confirmed" : "Owner rejected",
    });
    await notify({
      userId: session.user.id,
      type: "wallet",
      title:
        parsed.data.decision === "approved"
          ? "Self-funding recorded"
          : "Self-funding entry rejected",
      body: `Reference ${entry.reference}`,
      resourceType: "wallet",
      resourceId: wallet.id,
    });
    return apiOk(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not process this transaction.", 400);
  }
}
