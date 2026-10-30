import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { agreements, conversations, fundingRequests, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { loadProjectWithAccess } from "@/lib/project-access";
import { getSession } from "@/lib/session";

/** Request conversations for this project (members and above, never providers). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);
  if (loaded.access.role === "provider" || loaded.access.role === "none") {
    return apiError("You do not have access to this project's conversations.", 403);
  }

  const db = getDb();
  const rows = await db
    .select({
      requestId: fundingRequests.id,
      status: fundingRequests.status,
      amountMinor: fundingRequests.amountMinor,
      currency: fundingRequests.currency,
      createdAt: fundingRequests.createdAt,
      providerName: users.name,
      conversationId: conversations.id,
      conversationTitle: conversations.title,
    })
    .from(fundingRequests)
    .leftJoin(users, eq(users.id, fundingRequests.providerId))
    .leftJoin(conversations, eq(conversations.requestId, fundingRequests.id))
    .where(eq(fundingRequests.projectId, id))
    .orderBy(desc(fundingRequests.createdAt))
    .limit(100);

  const requestIds = rows.map((r) => r.requestId);
  const agreementRows =
    requestIds.length > 0
      ? await db
          .select({
            id: agreements.id,
            requestId: agreements.requestId,
            version: agreements.version,
            title: agreements.title,
            status: agreements.status,
            createdAt: agreements.createdAt,
            decidedAt: agreements.decidedAt,
          })
          .from(agreements)
          .where(inArray(agreements.requestId, requestIds))
          .orderBy(desc(agreements.createdAt))
          .limit(200)
      : [];

  return apiOk({ threads: rows, agreements: agreementRows });
}
