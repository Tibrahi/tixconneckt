import { getSession } from "@/lib/session";
import { signSocketTicket } from "@/lib/tokens";
import { apiError, apiOk } from "@/lib/api-response";

/** Issue a short-lived socket handshake ticket for the current session. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const ticket = await signSocketTicket(session.user.id);
  return apiOk({ ticket });
}
