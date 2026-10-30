import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversationMembers, conversations, groupMembers } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { postSystemMessage } from "@/lib/chat";
import { loadRequestWithSide } from "@/lib/project-access";
import { notify } from "@/lib/notify";
import { getSession } from "@/lib/session";

/** Participant user ids for a request thread: provider + requester side. */
async function participantIds(
  db: ReturnType<typeof getDb>,
  request: { providerId: string | null; requesterType: string; requesterId: string },
): Promise<string[]> {
  const ids = new Set<string>();
  if (request.providerId) ids.add(request.providerId);
  if (request.requesterType === "individual") {
    ids.add(request.requesterId);
  } else {
    const admins = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, request.requesterId),
          eq(groupMembers.status, "active"),
          eq(groupMembers.role, "admin"),
        ),
      )
      .limit(50);
    for (const a of admins) ids.add(a.userId);
  }
  return [...ids];
}

/** The structured conversation for this request, if one exists yet. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadRequestWithSide(id, session.user.id);
  if ("error" in loaded) return apiError(loaded.error, loaded.status);

  const db = getDb();
  const [conv] = await db
    .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.requestId, id))
    .limit(1);
  return apiOk({ conversation: conv ?? null });
}

/**
 * Open (or join) the request's negotiation thread. Either side may start it;
 * membership is recomputed from the current participants so newly added
 * group admins can join.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const loaded = await loadRequestWithSide(id, session.user.id);
  if ("error" in loaded) return apiError(loaded.error, loaded.status);
  const { request, project } = loaded;

  const db = getDb();
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.requestId, id))
    .limit(1);

  const participants = await participantIds(db, request);
  if (existing) {
    for (const userId of participants) {
      await db
        .insert(conversationMembers)
        .values({ conversationId: existing.id, userId, role: "member" })
        .onConflictDoNothing();
    }
    return apiOk({ conversationId: existing.id, created: false });
  }

  const [conv] = await db
    .insert(conversations)
    .values({
      type: "provider",
      title: `Request: ${project.title}`.slice(0, 200),
      requestId: id,
      createdBy: session.user.id,
    })
    .returning({ id: conversations.id });
  for (const userId of participants) {
    await db
      .insert(conversationMembers)
      .values({ conversationId: conv.id, userId, role: "member" })
      .onConflictDoNothing();
  }
  await postSystemMessage(
    conv.id,
    `Negotiation started for "${project.title}". Agreements and funding decisions stay linked to this request.`,
    { event: "request_thread_opened", requestId: id },
  );

  for (const userId of participants) {
    if (userId === session.user.id) continue;
    await notify({
      userId,
      type: "request",
      title: "Request conversation opened",
      body: `"${project.title}" now has a negotiation thread.`,
      resourceType: "conversation",
      resourceId: conv.id,
    });
  }
  return apiOk({ conversationId: conv.id, created: true }, 201);
}
