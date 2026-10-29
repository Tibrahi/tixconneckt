import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fundingRequests,
  groups,
  payments,
  projects,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

async function requireAdminSession() {
  const session = await getSession();
  if (!session) return { error: apiError("Sign in required.", 401), session: null };
  if (session.user.role !== "admin") {
    return { error: apiError("Administrators only.", 403), session: null };
  }
  return { error: null as null, session };
}

/** Platform overview counts + recent sensitive events. */
export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
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
    recentAudit,
  });
}
