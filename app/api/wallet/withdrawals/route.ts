import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { groupMembers, wallets, withdrawals } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { notify } from "@/lib/notify";
import { emitToRoom } from "@/lib/realtime";
import { getSession } from "@/lib/session";
import { decideEntry } from "@/lib/wallet";

const decideSchema = z.object({
  withdrawalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/** Group admin approves or rejects a withdrawal (restricted to group balance). */
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
  const [draw] = await db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.id, parsed.data.withdrawalId))
    .limit(1);
  if (!draw || draw.status !== "pending") {
    return apiError("Withdrawal not found or already processed.", 404);
  }
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, draw.walletId)).limit(1);
  if (!wallet || wallet.ownerType !== "group") return apiError("Group wallet not found.", 404);
  const [admin] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, wallet.ownerId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);
  if (!admin) return apiError("Only group admins can approve withdrawals.", 403);

  try {
    const result = await decideEntry({
      entryId: draw.ledgerEntryId!,
      decision: parsed.data.decision,
      actorId: session.user.id,
      reason: `Withdrawal ${parsed.data.decision} by group admin`,
    });
    await db
      .update(withdrawals)
      .set({ status: parsed.data.decision, decidedBy: session.user.id, decidedAt: new Date() })
      .where(eq(withdrawals.id, draw.id));
    await notify({
      userId: draw.requesterId,
      type: "wallet",
      title: `Withdrawal ${parsed.data.decision}`,
      resourceType: "wallet",
      resourceId: wallet.id,
    });
    await emitToRoom(`group:${wallet.ownerId}`, "wallet:updated", { kind: "withdrawal" });
    return apiOk(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Could not process this withdrawal.", 400);
  }
}
