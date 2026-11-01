import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { callHides } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { callHideSchema } from "@/lib/validation";
import { loadParticipantCall } from "../_lib";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Hide or show an ended call in personal history. Only accepted/ended
 * calls may be hidden — missed, declined, and failed calls always stay
 * visible so outcomes are never silently dropped.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const call = await loadParticipantCall(id, session.user.id);
  if (!call) return apiError("Call not found.", 404);
  if (call.status !== "accepted" && call.status !== "ended") {
    return apiError("Only ended calls can be hidden.", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = callHideSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid hide value.", 400);

  const db = getDb();
  if (parsed.data.hidden) {
    await db
      .insert(callHides)
      .values({ callId: id, userId: session.user.id })
      .onConflictDoNothing();
  } else {
    await db
      .delete(callHides)
      .where(and(eq(callHides.callId, id), eq(callHides.userId, session.user.id)));
  }
  return apiOk({ hidden: parsed.data.hidden });
}
