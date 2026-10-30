import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { withdrawals } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { settleWithdrawal } from "@/lib/payout";
import { tixlpayCallbackConfigured, verifyCallbackSignature } from "@/lib/tixlpay";

const callbackSchema = z.object({
  providerReference: z.string().min(1).max(200),
  status: z.enum(["completed", "failed"]),
  failureReason: z.string().max(2000).optional(),
});

/**
 * Authenticated TixlPay payout callback (wallet.md §5). No session — trust
 * comes from the HMAC signature over the raw body. Settles the withdrawal
 * idempotently: replays return deduplicated without double-processing.
 */
export async function POST(req: Request) {
  if (!tixlpayCallbackConfigured()) {
    return apiError("Payout callbacks are not configured.", 503);
  }
  const rawBody = await req.text();
  const signature = req.headers.get("x-tixlpay-signature");
  if (!verifyCallbackSignature(rawBody, signature)) {
    return apiError("Invalid callback signature.", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return apiError("Invalid callback body.", 400);
  }
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid callback body.", 400);

  const db = getDb();
  const [draw] = await db
    .select({ id: withdrawals.id })
    .from(withdrawals)
    .where(eq(withdrawals.providerReference, parsed.data.providerReference))
    .limit(1);
  if (!draw) return apiError("Unknown payout reference.", 404);

  try {
    const result = await settleWithdrawal({
      withdrawalId: draw.id,
      outcome: parsed.data.status,
      providerStatus: parsed.data.status,
      failureReason: parsed.data.failureReason,
      ipAddress: clientIp(req),
    });
    return apiOk(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not settle this payout.", 400);
  }
}
