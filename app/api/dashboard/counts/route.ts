import { isDatabaseUnavailable } from "@/db";
import { apiError, apiOk } from "@/lib/api-response";
import { getCachedDashboardCounts, unavailableHeaders } from "@/lib/dashboard-queries";
import { getSession } from "@/lib/session";

/** Real unread counts for Chat, Notifications, and pending Conneckt requests. */
export async function GET() {
  let session;
  try {
    session = await getSession({ throwOnDatabaseUnavailable: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return apiError(
        "Dashboard data is temporarily unavailable. Please retry in a moment.",
        503,
        undefined,
        unavailableHeaders(),
      );
    }
    throw error;
  }
  if (!session) return apiError("Sign in required.", 401);

  try {
    // Single round trip + short per-user cache: concurrent polling tabs and
    // realtime refresh bursts share one database execution.
    const counts = await getCachedDashboardCounts(session.user.id);
    return apiOk(counts);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return apiError(
        "Dashboard data is temporarily unavailable. Please retry in a moment.",
        503,
        undefined,
        unavailableHeaders(),
      );
    }
    throw error;
  }
}
