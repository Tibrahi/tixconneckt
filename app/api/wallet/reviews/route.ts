import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { ledgerEntries, parsingJobs, users, wallets } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { depositDecisionEmail, evidenceRequestEmail } from "@/lib/email";
import { notifyMember } from "@/lib/notify";
import { getSession, isAdminRole } from "@/lib/session";
import { reviewDecisionSchema } from "@/lib/validation";
import { decideEntry, requestEvidence } from "@/lib/wallet";

/**
 * Independent review queue (wallet.md FR-04). Admins see pending individual
 * deposits with the minimum needed to verify: parsed fields, evidence link,
 * and the uploader's display name — never other private data.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (!isAdminRole(session.user.role)) {
    return apiError("Only reviewers can access the verification queue.", 403);
  }

  const db = getDb();
  const userWallets = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.ownerType, "user"));
  const walletIds = userWallets.map((w) => w.id);

  const entries =
    walletIds.length > 0
      ? await db
          .select({
            entry: ledgerEntries,
            uploaderName: users.name,
            uploaderShortId: users.shortId,
          })
          .from(ledgerEntries)
          .leftJoin(users, eq(users.id, ledgerEntries.createdBy))
          .where(
            and(
              inArray(ledgerEntries.walletId, walletIds),
              eq(ledgerEntries.kind, "self_funding"),
              inArray(ledgerEntries.status, ["pending", "needs_evidence"]),
            ),
          )
          .orderBy(desc(ledgerEntries.createdAt))
          .limit(100)
      : [];

  // Evidence the AI could not parse, awaiting authorized manual verification.
  const manualJobs = await db
    .select({
      job: parsingJobs,
      uploaderName: users.name,
      uploaderShortId: users.shortId,
    })
    .from(parsingJobs)
    .leftJoin(users, eq(users.id, parsingJobs.requestedBy))
    .where(
      and(
        eq(parsingJobs.destinationType, "wallet"),
        eq(parsingJobs.status, "failed"),
      ),
    )
    .orderBy(desc(parsingJobs.createdAt))
    .limit(50);

  return apiOk({
    entries: entries.map((row) => ({
      id: row.entry.id,
      reference: row.entry.reference,
      direction: row.entry.direction,
      amountMinor: row.entry.amountMinor,
      currency: row.entry.currency,
      status: row.entry.status,
      metadata: row.entry.metadata,
      documentId: row.entry.documentId,
      relatedId: row.entry.relatedId,
      createdBy: row.entry.createdBy,
      createdAt: row.entry.createdAt,
      uploaderName: row.uploaderName,
      uploaderShortId: row.uploaderShortId,
    })),
    manualJobs: manualJobs
      .filter((row) => !row.job.destinationId)
      .map((row) => ({
        id: row.job.id,
        documentId: row.job.documentId,
        inputText: row.job.inputText,
        error: row.job.error,
        requestedBy: row.job.requestedBy,
        createdAt: row.job.createdAt,
        uploaderName: row.uploaderName,
        uploaderShortId: row.uploaderShortId,
      })),
  });
}

/**
 * Review decision: approve (credits exactly once), reject with a mandatory
 * reason, or request additional evidence. The uploader can never approve
 * their own transaction.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  if (!isAdminRole(session.user.role)) {
    return apiError("Only reviewers can decide transactions.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = reviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? "Invalid decision.", 400);
  }

  const db = getDb();
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.id, parsed.data.entryId))
    .limit(1);
  if (!entry) return apiError("Transaction not found.", 404);
  if (entry.kind !== "self_funding") {
    return apiError("Only individual deposits are reviewed here.", 400);
  }
  if (entry.status !== "pending" && entry.status !== "needs_evidence") {
    return apiError("This transaction has already been processed.", 400);
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, entry.walletId)).limit(1);
  if (!wallet || wallet.ownerType !== "user") {
    return apiError("Only individual deposits are reviewed here.", 400);
  }
  if (entry.createdBy === session.user.id) {
    return apiError("You cannot review your own transaction.", 403);
  }

  const [uploader] = entry.createdBy
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, entry.createdBy))
        .limit(1)
    : [];

  try {
    if (parsed.data.decision === "needs_evidence") {
      await requestEvidence({
        entryId: entry.id,
        actorId: session.user.id,
        reason: parsed.data.reason!,
      });
      if (uploader) {
        const email = evidenceRequestEmail({
          memberName: uploader.name,
          amountMinor: entry.amountMinor,
          currency: entry.currency,
          status: entry.status,
          reference: entry.reference,
          reason: parsed.data.reason,
        });
        await notifyMember(uploader.id, {
          type: "wallet",
          title: "Additional evidence needed",
          body: `Your deposit ${entry.reference} needs more evidence.`,
          resourceType: "ledger_entry",
          resourceId: entry.id,
          email,
        });
      }
      await audit({
        actorId: session.user.id,
        action: "wallet.review.evidence_requested",
        targetType: "ledger_entry",
        targetId: entry.id,
        ipAddress: clientIp(req),
      });
      return apiOk({ status: "needs_evidence" });
    }

    const result = await decideEntry({
      entryId: entry.id,
      decision: parsed.data.decision,
      actorId: session.user.id,
      reason: parsed.data.reason,
    });

    if (uploader) {
      const status = parsed.data.decision === "approved" ? "credited" : "rejected";
      const email = depositDecisionEmail({
        memberName: uploader.name,
        amountMinor: entry.amountMinor,
        currency: entry.currency,
        status,
        reference: entry.reference,
        reason: parsed.data.reason,
      });
      await notifyMember(uploader.id, {
        type: "wallet",
        title:
          parsed.data.decision === "approved" ? "Deposit approved" : "Deposit rejected",
        body: `Your deposit ${entry.reference} was ${status}.`,
        resourceType: "wallet",
        resourceId: wallet.id,
        email,
      });
    }

    await audit({
      actorId: session.user.id,
      action: `wallet.review.${parsed.data.decision}`,
      targetType: "ledger_entry",
      targetId: entry.id,
      ipAddress: clientIp(req),
    });
    return apiOk({ ...result, status: parsed.data.decision === "approved" ? "credited" : "rejected" });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not process this decision.", 400);
  }
}
