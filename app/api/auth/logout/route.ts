import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { apiOk } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { clearSessionCookie, sessionCookieName } from "@/lib/auth-session";

/** End the session: revoke server-side, clear cookie, redirect to login. */
export async function POST() {
  const store = await cookies();
  const cookie = store.get(sessionCookieName())?.value;
  const token = cookie?.split(".")[0];
  if (token) {
    try {
      const db = getDb();
      const deleted = await db
        .delete(sessions)
        .where(eq(sessions.token, token))
        .returning({ userId: sessions.userId, id: sessions.id });
      if (deleted[0]) {
        await audit({
          actorId: deleted[0].userId,
          action: "session.logout",
          targetType: "session",
          targetId: deleted[0].id,
        });
      }
    } catch {
      /* logout still clears the cookie below */
    }
  }
  await clearSessionCookie();
  return apiOk({ loggedOut: true });
}
