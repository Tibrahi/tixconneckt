import { and, count, desc, eq, inArray, isNotNull, ne, notInArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connections,
  conversationMembers,
  conversations,
  groupMembers,
  messageReads,
  messages,
  projects,
  providerLinks,
  users,
} from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { conversationCreateSchema } from "@/lib/validation";

/**
 * List my conversations with last message, real unread counts, categories,
 * and per-member settings. Supports ?filter= for the navigation filters;
 * archived conversations are hidden unless explicitly requested.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const userId = session.user.id;
  const db = getDb();
  const filter = new URL(req.url).searchParams.get("filter") ?? "all";

  const mine = await db
    .select({
      conversationId: conversationMembers.conversationId,
      settings: conversationMembers.settings,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  if (mine.length === 0) return apiOk({ individual: [], group: [] });
  const ids = mine.map((m) => m.conversationId);
  const settingsByConv = new Map(mine.map((m) => [m.conversationId, m.settings as { muted?: boolean; pinned?: boolean; archived?: boolean }]));

  const convs = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, ids))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);
  if (convs.length === 0) return apiOk({ individual: [], group: [] });

  const memberRows = await db
    .select({
      conversationId: conversationMembers.conversationId,
      userId: conversationMembers.userId,
      name: users.name,
      shortId: users.shortId,
      role: users.role,
      providerKind: users.providerKind,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(inArray(conversationMembers.conversationId, ids));

  const membersByConv = new Map<string, Array<{ userId: string; name: string; shortId: string; role: string; providerKind: string | null }>>();
  for (const m of memberRows) {
    const list = membersByConv.get(m.conversationId) ?? [];
    list.push({ userId: m.userId, name: m.name, shortId: m.shortId, role: m.role, providerKind: m.providerKind });
    membersByConv.set(m.conversationId, list);
  }

  // Project-linked conversation ids (group projects + provider-link projects).
  const groupIds = [...new Set(convs.map((c) => c.groupId).filter((v): v is string => !!v))];
  const projectGroups =
    groupIds.length > 0
      ? await db
          .select({ groupId: projects.groupId })
          .from(projects)
          .where(inArray(projects.groupId, groupIds))
      : [];
  const projectGroupSet = new Set(projectGroups.map((p) => p.groupId));
  const linkIds = [...new Set(convs.map((c) => c.providerLinkId).filter((v): v is string => !!v))];
  const projectLinkRows =
    linkIds.length > 0
      ? await db
          .select({ id: providerLinks.id })
          .from(providerLinks)
          .where(
            and(
              inArray(providerLinks.id, linkIds),
              isNotNull(providerLinks.projectId),
              ne(providerLinks.projectId, ""),
            ),
          )
      : [];
  const projectLinkSet = new Set(projectLinkRows.map((r) => r.id));

  const readIds = db
    .select({ id: messageReads.messageId })
    .from(messageReads)
    .where(eq(messageReads.userId, userId));
  const conversationIds = convs.map((c) => c.id);
  // Batch latest-message and unread summaries; avoid two queries per row.
  const [latestRows, unreadRows] = await Promise.all([
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        body: messages.body,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(messages.conversationId, desc(messages.createdAt)),
    db
      .select({ conversationId: messages.conversationId, n: count() })
      .from(messages)
      .where(and(inArray(messages.conversationId, conversationIds), ne(messages.senderId, userId), notInArray(messages.id, readIds)))
      .groupBy(messages.conversationId),
  ]);
  const latestByConversation = new Map(latestRows.map((row) => [row.conversationId, row]));
  const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, row.n]));

  const shaped = convs.map((c) => {
      const last = latestByConversation.get(c.id);
      const members = membersByConv.get(c.id) ?? [];
      const others = members.filter((m) => m.userId !== userId);
      const title =
        c.title ??
        (c.type === "direct"
          ? (others[0]?.name ?? "Conversation")
          : others.length > 0
            ? others.map((o) => o.name).slice(0, 3).join(", ")
            : "Group conversation");
      const peerProvider = others.find((o) => o.role === "provider");
      const settings = settingsByConv.get(c.id) ?? {};
      return {
        id: c.id,
        type: c.type,
        title,
        groupId: c.groupId,
        updatedAt: c.updatedAt,
        unread: unreadByConversation.get(c.id) ?? 0,
        lastMessage: last
          ? {
              preview: last.deletedAt ? "This message was deleted." : last.body.slice(0, 120),
              createdAt: last.createdAt,
            }
          : null,
        memberCount: members.length,
        peerShortId: c.type === "direct" ? (others[0]?.shortId ?? null) : null,
        providerKind: peerProvider?.providerKind ?? null,
        hasProject:
          (c.groupId ? projectGroupSet.has(c.groupId) : false) ||
          (c.providerLinkId ? projectLinkSet.has(c.providerLinkId) : false),
        muted: settings.muted === true,
        pinned: settings.pinned === true,
        archived: settings.archived === true,
      };
    });

  let filtered = shaped;
  if (filter === "archived") {
    filtered = shaped.filter((s) => s.archived);
  } else {
    filtered = shaped.filter((s) => !s.archived);
    if (filter === "individual") filtered = filtered.filter((s) => s.type === "direct");
    else if (filter === "groups") filtered = filtered.filter((s) => s.type === "group");
    else if (filter === "providers") filtered = filtered.filter((s) => s.type === "provider");
    else if (filter === "projects") filtered = filtered.filter((s) => s.hasProject);
    else if (filter === "unread") filtered = filtered.filter((s) => s.unread > 0);
  }
  filtered.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return apiOk({
    individual: filtered.filter((s) => s.type === "direct" || s.type === "provider"),
    group: filtered.filter((s) => s.type === "group"),
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
      await db.transaction(async (tx) => {
        await tx.insert(conversations).values({
          id: conversationId,
          type: "group",
          title: input.title,
          groupId: input.groupId,
          createdBy: userId,
        });
        if (memberRows.length > 0) {
          await tx.insert(conversationMembers).values(memberRows);
        }
      });
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

  // Reuse the existing conversation for this provider link when present.
  const [existingProviderConv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.type, "provider"), eq(conversations.providerLinkId, link.id)))
    .limit(1);
  if (existingProviderConv) {
    const [alreadyMember] = await db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, existingProviderConv.id),
          eq(conversationMembers.userId, userId),
        ),
      )
      .limit(1);
    if (alreadyMember) return apiOk({ conversationId: existingProviderConv.id, reused: true });
  }

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
