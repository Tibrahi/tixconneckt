import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { memberAccounts } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { isSupportedCurrency, normalizeCurrency } from "@/lib/currency";
import { getSession, isAdminRole } from "@/lib/session";
import { accountSettingsSchema } from "@/lib/validation";
import { getOrCreateMemberAccount } from "@/lib/wallet";

/** Read my savings account configuration (created with defaults on first read). */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const account = await getOrCreateMemberAccount(session.user.id);
  return apiOk({ account });
}

const adminStatusSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["active", "restricted", "locked", "closed"]),
});

/**
 * Update my account settings. Members configure targets, limits, dates,
 * frequency, withdrawal rules, notifications, and visibility — account
 * status (locked/closed) is admin-only.
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

  const db = getDb();

  // Admin path: set any member's account status.
  const adminParsed = adminStatusSchema.safeParse(body);
  if (adminParsed.success && (body as Record<string, unknown>).userId !== undefined) {
    if (!isAdminRole(session.user.role)) {
      return apiError("Only administrators can change account status.", 403);
    }
    await getOrCreateMemberAccount(adminParsed.data.userId);
    const [updated] = await db
      .update(memberAccounts)
      .set({ status: adminParsed.data.status })
      .where(eq(memberAccounts.userId, adminParsed.data.userId))
      .returning();
    await audit({
      actorId: session.user.id,
      action: "wallet.account.status",
      targetType: "member_account",
      targetId: adminParsed.data.userId,
      metadata: { status: adminParsed.data.status },
      ipAddress: clientIp(req),
    });
    return apiOk({ account: updated });
  }

  const parsed = accountSettingsSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return apiError(first?.message ?? "Invalid account settings.", 400);
  }
  if (parsed.data.currency && !isSupportedCurrency(parsed.data.currency)) {
    return apiError(`Currency ${parsed.data.currency} is not supported.`, 400);
  }

  const patch: Partial<typeof memberAccounts.$inferInsert> = {};
  if (parsed.data.currency !== undefined) patch.currency = normalizeCurrency(parsed.data.currency);
  if (parsed.data.savingsTargetMinor !== undefined) patch.savingsTargetMinor = parsed.data.savingsTargetMinor;
  if (parsed.data.minContributionMinor !== undefined) patch.minContributionMinor = parsed.data.minContributionMinor;
  if (parsed.data.maxContributionMinor !== undefined) patch.maxContributionMinor = parsed.data.maxContributionMinor;
  if (parsed.data.minWithdrawalMinor !== undefined) patch.minWithdrawalMinor = parsed.data.minWithdrawalMinor;
  if (parsed.data.startDate !== undefined) {
    patch.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  }
  if (parsed.data.targetDate !== undefined) {
    patch.targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;
  }
  if (parsed.data.frequency !== undefined) patch.frequency = parsed.data.frequency;
  if (parsed.data.withdrawalRules !== undefined) {
    const current = await getOrCreateMemberAccount(session.user.id);
    patch.withdrawalRules = { ...current.withdrawalRules, ...parsed.data.withdrawalRules };
  }
  if (parsed.data.notifyEmail !== undefined) patch.notifyEmail = parsed.data.notifyEmail;
  if (parsed.data.notifyInApp !== undefined) patch.notifyInApp = parsed.data.notifyInApp;
  if (parsed.data.visibility !== undefined) patch.visibility = parsed.data.visibility;

  await getOrCreateMemberAccount(session.user.id);
  const [updated] = await db
    .update(memberAccounts)
    .set(patch)
    .where(eq(memberAccounts.userId, session.user.id))
    .returning();

  await audit({
    actorId: session.user.id,
    action: "wallet.account.update",
    targetType: "member_account",
    targetId: session.user.id,
    ipAddress: clientIp(req),
  });
  return apiOk({ account: updated });
}
