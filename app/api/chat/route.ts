import { and, count, desc, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connections,
  conversationMembers,
  conversations,
  groupMembers,
  messageReads,
  messages,
  providerLinks,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { conversationCreateSchema } from "@/lib/validation";

/** List my conversations with last message and real unread counts. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;
  const db = getDb();

  const mine = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  if (mine.length === 0) return apiOk({ individual: [], group: [] });
  const ids = mine.map((m) => m.conversationId);

  const convs = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, ids))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);

  const memberRows = await db
    .select({
      conversationId: conversationMembers.conversationId,
      userId: conversationMembers.userId,
      name: users.name,
      shortId: users.shortId,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(inArray(conversationMembers.conversationId, ids));

  const membersByConv = new Map<string, Array<{ userId: string; name: string; shortId: string }>>();
  for (const m of memberRows) {
    const list = membersByConv.get(m.conversationId) ?? [];
    list.push({ userId: m.userId, name: m.name, shortId: m.shortId });
    membersByConv.set(m.conversationId, list);
  }

  const readIds = db
    .select({ id: messageReads.messageId })
    .from(messageReads)
    .where(eq(messageReads.userId, userId));

  const shaped = await Promise.all(
    convs.map(async (c) => {
      const [last] = await db
        .select({ body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId })
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const [unread] = await db
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, c.id),
            ne(messages.senderId, userId),
            notInArray(messages.id, readIds),
          ),
        );
      const members = membersByConv.get(c.id) ?? [];
      const others = members.filter((m) => m.userId !== userId);
      const title =
        c.title ??
        (c.type === "direct"
          ? (others[0]?.name ?? "Conversation")
          : others.length > 0
            ? others.map((o) => o.name).slice(0, 3).join(", ")
            : "Group conversation");
      return {
        id: c.id,
        type: c.type,
        title,
        groupId: c.groupId,
        updatedAt: c.updatedAt,
        unread: unread?.n ?? 0,
        lastMessage: last ? { preview: last.body.slice(0, 120), createdAt: last.createdAt } : null,
        memberCount: members.length,
      };
    }),
  );

  return apiOk({
    individual: shaped.filter((s) => s.type === "direct" || s.type === "provider"),
    group: shaped.filter((s) => s.type === "group"),
  });
}

/**
 * Create a conversation. Direct requires an accepted connection; group requires
 * membership; provider requires an approved provider link.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = conversationCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid conversation request.", 400);
  const input = parsed.data;
  const userId = session.user.id;
  const db = getDb();

  if (input.type === "direct") {
    const peerId = input.memberShortIds?.[0];
    if (!peerId) return apiError("Select one person to chat with.", 400);
    const [peer] = await db.select().from(users).where(eq(users.shortId, peerId.toUpperCase())).limit(1);
    if (!peer || peer.id === userId) return apiError("Person not found.", 404);
    // Accepted-connection check in either direction.
    const pairRows = await db
      .select({ id: connections.id })
      .from(connections)
      .where(
        and(
          eq(connections.status, "accepted"),
          or(
            and(eq(connections.requesterId, userId), eq(connections.addresseeId, peer.id)),
            and(eq(connections.requesterId, peer.id), eq(connections.addresseeId, userId)),
          ),
        ),
      )
      .limit(1);
    if (pairRows.length === 0) {
      return apiError("You can only chat with accepted connections.", 403);
    }

    // Reuse an existing direct conversation between the pair.
    const myConvs = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId));
    for (const mc of myConvs) {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, mc.conversationId), eq(conversations.type, "direct")))
        .limit(1);
      if (!conv) continue;
      const members = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conv.id));
      const ids = members.map((m) => m.userId);
      if (ids.length === 2 && ids.includes(peer.id)) {
        return apiOk({ conversationId: conv.id, reused: true });
      }
    }

    const inserted = await db
      .insert(conversations)
      .values({ type: "direct", createdBy: userId })
      .returning({ id: conversations.id });
    await db.insert(conversationMembers).values([
      { conversationId: inserted[0].id, userId, role: "member" },
      { conversationId: inserted[0].id, userId: peer.id, role: "member" },
    ]);
    return apiOk({ conversationId: inserted[0].id }, 201);
  }

  if (input.type === "group") {
    if (!input.groupId) return apiError("Select a group.", 400);
    const mine = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, input.groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    if (mine.length === 0) return apiError("You are not a member of this group.", 403);
    const members = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")));

    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.type, "group"), eq(conversations.groupId, input.groupId)))
      .limit(1);
    const conversationId = existing?.id ?? crypto.randomUUID();
    const memberRows = members.map((member) => ({
          conversationId,
          userId: member.userId,
          role: member.userId === userId ? "admin" : "member",
        }));

    if (existing) {
      if (memberRows.length > 0) {
        await db.insert(conversationMembers).values(memberRows).onConflictDoNothing();
      }
    } else {
      await db.batch([
        db.insert(conversations).values({
          id: conversationId,
          type: "group",
          title: input.title,
          groupId: input.groupId,
          createdBy: userId,
        }),
        ...(memberRows.length > 0
          ? [db.insert(conversationMembers).values(memberRows)]
          : []),
      ]);
    }
    return apiOk({ conversationId, reused: Boolean(existing) }, existing ? 200 : 201);
  }

  // provider
  if (!input.providerLinkId) return apiError("Select an approved provider connection.", 400);
  const [link] = await db
    .select()
    .from(providerLinks)
    .where(and(eq(providerLinks.id, input.providerLinkId), eq(providerLinks.status, "approved")))
    .limit(1);
  if (!link) return apiError("No approved provider connection found.", 403);
  const involved =
    link.providerId === userId || link.individualId === userId || link.requestedBy === userId;
  let groupOk = false;
  if (link.groupId) {
    const gm = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, link.groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    groupOk = gm.length > 0;
  }
  if (!involved && !groupOk) return apiError("This provider connection does not involve you.", 403);

  const otherId = link.providerId === userId ? (link.individualId ?? link.requestedBy) : link.providerId;
  const inserted = await db
    .insert(conversations)
    .values({ type: "provider", providerLinkId: link.id, createdBy: userId })
    .returning({ id: conversations.id });
  await db.insert(conversationMembers).values([
    { conversationId: inserted[0].id, userId, role: "member" },
    { conversationId: inserted[0].id, userId: otherId, role: "member" },
  ]);
  return apiOk({ conversationId: inserted[0].id }, 201);
}
