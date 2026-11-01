import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fundingRequests,
  groups,
  payments,
  projects,
  scheduledActions,
  users,
} from "@/db/schema";
import { apiOk } from "@/lib/api-response";
import { requireCapability } from "@/lib/roles";

/** Platform overview counts + recent sensitive events. */
export async function GET() {
  const { actor, response } = await requireCapability("admin.access");
  if (!actor) return response;
  const db = getDb();

  const [userCount] = await db.select({ n: count() }).from(users);
  const [activeUsers] = await db.select({ n: count() }).from(users).where(eq(users.status, "active"));
  const [groupCount] = await db.select({ n: count() }).from(groups);
  const [projectCount] = await db.select({ n: count() }).from(projects);
  const [pendingRequests] = await db
    .select({ n: count() })
    .from(fundingRequests)
    .where(eq(fundingRequests.status, "pending"));
  const [pendingPayments] = await db
    .select({ n: count() })
    .from(payments)
    .where(eq(payments.status, "pending"));
  const [pendingActions] = await db
    .select({ n: count() })
    .from(scheduledActions)
    .where(eq(scheduledActions.status, "confirmed"));
  const [executingActions] = await db
    .select({ n: count() })
    .from(scheduledActions)
    .where(eq(scheduledActions.status, "executing"));
  const [failedActions] = await db
    .select({ n: count() })
    .from(scheduledActions)
    .where(eq(scheduledActions.status, "failed"));
  const recentAudit = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  return apiOk({
    users: userCount?.n ?? 0,
    activeUsers: activeUsers?.n ?? 0,
    groups: groupCount?.n ?? 0,
    projects: projectCount?.n ?? 0,
    pendingRequests: pendingRequests?.n ?? 0,
    pendingPayments: pendingPayments?.n ?? 0,
    pendingActions: pendingActions?.n ?? 0,
    executingActions: executingActions?.n ?? 0,
    failedActions: failedActions?.n ?? 0,
    recentAudit,
  });
}
