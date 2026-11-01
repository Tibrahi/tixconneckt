import { dbFailureCode, isDatabaseUnavailable } from "@/db";
import { apiError, apiOk } from "@/lib/api-response";
import { getCachedDashboardCounts, unavailableHeaders } from "@/lib/dashboard-queries";
import { getSession } from "@/lib/session";

function unavailable(stage: "session" | "counts", error: unknown) {
  // Structured trace for every 503: endpoint + stage + failure category.
  console.warn(`[api:dashboard:counts:503] stage=${stage} code=${dbFailureCode(error)}`);
  return apiError(
    "Dashboard data is temporarily unavailable. Please retry in a moment.",
    503,
    undefined,
    unavailableHeaders(),
  );
}

/** Real unread counts for Chat, Notifications, and pending Conneckt requests. */
export async function GET() {
  let session;
  try {
    session = await getSession({ throwOnDatabaseUnavailable: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return unavailable("session", error);
    throw error;
  }
  if (!session) return apiError("Sign in required.", 401);

  try {
    // Single round trip + short per-user cache: concurrent polling tabs and
    // realtime refresh bursts share one database execution. Transient
    // outages serve last-known counts flagged stale instead of 503ing.
    const counts = await getCachedDashboardCounts(session.user.id);
    return apiOk(counts);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return unavailable("counts", error);
    throw error;
  }
}
