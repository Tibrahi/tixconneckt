import { and, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  connections,
  groupMembers,
  groups,
  matchingProfiles,
  matchResults,
  profiles,
  users,
} from "@/db/schema";
import { callMuseSpark } from "@/lib/ai";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { matchingAnswerSchema } from "@/lib/validation";
import { getSession } from "@/lib/session";
import { rankCandidates, type CandidateInput } from "@/lib/matching";
import { notify } from "@/lib/notify";

/** Save matching answers, persist to profile, and compute new suggestions. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = matchingAnswerSchema.safeParse(body);
  if (!parsed.success) return apiError("Please answer every question.", 400);
  const input = parsed.data;
  const userId = session.user.id;
  const db = getDb();

  await db
    .insert(matchingProfiles)
    .values({
      userId,
      objective: input.objective,
      skills: input.skills,
      strengths: input.strengths ?? [],
      field: input.field,
      education: input.education,
    })
    .onConflictDoUpdate({
      target: matchingProfiles.userId,
      set: {
        objective: input.objective,
        skills: input.skills,
        strengths: input.strengths ?? [],
        field: input.field,
        education: input.education,
      },
    });

  // Persist answers to the user's profile as well.
  await db
    .insert(profiles)
    .values({
      userId,
      objectives: input.objective,
      skills: input.skills,
      strengths: input.strengths ?? [],
      fields: [input.field],
      major: input.education,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        objectives: input.objective,
        skills: input.skills,
        strengths: input.strengths ?? [],
        fields: [input.field],
        major: input.education,
      },
    });

  // Exclude self, existing connections, and previously decided matches.
  const linked = await db
    .select({ id: connections.id, requesterId: connections.requesterId, addresseeId: connections.addresseeId })
    .from(connections)
    .where(or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId)));
  const linkedIds = new Set<string>();
  for (const l of linked) {
    linkedIds.add(l.requesterId);
    linkedIds.add(l.addresseeId);
  }
  const decided = await db
    .select({ candidateId: matchResults.candidateId })
    .from(matchResults)
    .where(and(eq(matchResults.userId, userId), ne(matchResults.status, "suggested")));
  const decidedIds = new Set(decided.map((d) => d.candidateId));

  const others = await db
    .select({
      userId: users.id,
      name: users.name,
      shortId: users.shortId,
      objective: matchingProfiles.objective,
      skills: matchingProfiles.skills,
      strengths: matchingProfiles.strengths,
      field: matchingProfiles.field,
      education: matchingProfiles.education,
    })
    .from(users)
    .innerJoin(matchingProfiles, eq(matchingProfiles.userId, users.id))
    .where(and(eq(users.status, "active"), ne(users.id, userId)))
    .limit(200);

  const candidates: CandidateInput[] = others
    .filter((o) => !linkedIds.has(o.userId) && !decidedIds.has(o.userId) && o.objective && o.field)
    .map((o) => ({
      userId: o.userId,
      objective: o.objective ?? "",
      skills: o.skills ?? [],
      strengths: o.strengths ?? [],
      field: o.field ?? "",
      education: o.education ?? undefined,
    }));

  const ranked = rankCandidates(
    {
      objective: input.objective,
      skills: input.skills,
      strengths: input.strengths ?? [],
      field: input.field,
      education: input.education,
    },
    candidates,
  );

  // Optional AI-assisted comparison — structured score stays authoritative.
  let aiNotes: Record<string, string> = {};
  let aiPending = false;
  if (ranked.length > 0) {
    const spark = await callMuseSpark({
      task: "match_score",
      input: {
        seeker: input,
        candidates: ranked.map((r) => ({
          userId: r.userId,
          rationale: r.rationale,
          complementarySkills: r.complementarySkills,
        })),
      },
    });
    if (!spark.configured) {
      aiPending = true;
    } else if (spark.data && typeof spark.data === "object") {
      const notes = (spark.data as { notes?: Record<string, string> }).notes;
      if (notes) aiNotes = notes;
    }
  }

  // Store suggestions (skip duplicates already suggested).
  const existingSuggested = await db
    .select({ candidateId: matchResults.candidateId })
    .from(matchResults)
    .where(
      and(
        eq(matchResults.userId, userId),
        eq(matchResults.status, "suggested"),
        ranked.length ? inArray(matchResults.candidateId, ranked.map((r) => r.userId)) : undefined,
      ),
    );
  const suggestedIds = new Set(existingSuggested.map((s) => s.candidateId));
  for (const r of ranked) {
    if (suggestedIds.has(r.userId)) continue;
    const rationale = [...r.rationale];
    if (aiNotes[r.userId]) rationale.push(`AI note: ${aiNotes[r.userId]}`);
    if (aiPending) rationale.push("Compatibility from structured rules (AI assist pending).");
    await db.insert(matchResults).values({
      userId,
      candidateId: r.userId,
      score: r.score,
      rationale: rationale.join(" · "),
      status: "suggested",
    });
  }

  await audit({
    actorId: userId,
    action: "matching.answer",
    targetType: "user",
    targetId: userId,
    ipAddress: clientIp(req),
  });

  return apiOk({ suggestions: ranked.length, aiPending });
}

/** List current suggestions with candidate summaries. */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const db = getDb();
  const rows = await db
    .select({
      id: matchResults.id,
      candidateId: matchResults.candidateId,
      score: matchResults.score,
      rationale: matchResults.rationale,
      status: matchResults.status,
      createdAt: matchResults.createdAt,
      name: users.name,
      shortId: users.shortId,
      field: matchingProfiles.field,
    })
    .from(matchResults)
    .innerJoin(users, eq(users.id, matchResults.candidateId))
    .innerJoin(matchingProfiles, eq(matchingProfiles.userId, matchResults.candidateId))
    .where(and(eq(matchResults.userId, session.user.id), eq(matchResults.status, "suggested")))
    .orderBy(matchResults.score)
    .limit(30);

  const mine = await db
    .select()
    .from(matchingProfiles)
    .where(eq(matchingProfiles.userId, session.user.id))
    .limit(1);

  return apiOk({ answers: mine[0] ?? null, suggestions: rows });
}

const decideSchema = z.object({
  candidateId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/** Approve (creates a connection request) or reject a suggestion. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid decision.", 400);
  const db = getDb();
  const userId = session.user.id;

  const rows = await db
    .select()
    .from(matchResults)
    .where(
      and(
        eq(matchResults.userId, userId),
        eq(matchResults.candidateId, parsed.data.candidateId),
        eq(matchResults.status, "suggested"),
      ),
    )
    .limit(1);
  if (rows.length === 0) return apiError("Suggestion not found.", 404);

  await db
    .update(matchResults)
    .set({ status: parsed.data.decision, decidedAt: new Date() })
    .where(eq(matchResults.id, rows[0].id));

  if (parsed.data.decision === "approved") {
    const existing = await db
      .select({ id: connections.id })
      .from(connections)
      .where(
        or(
          and(eq(connections.requesterId, userId), eq(connections.addresseeId, parsed.data.candidateId)),
          and(eq(connections.requesterId, parsed.data.candidateId), eq(connections.addresseeId, userId)),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      await db.insert(connections).values({
        requesterId: userId,
        addresseeId: parsed.data.candidateId,
        status: "pending",
      });
      const [candidate] = await db
        .select()
        .from(users)
        .where(eq(users.id, parsed.data.candidateId))
        .limit(1);
      if (candidate) {
        await notify({
          userId: candidate.id,
          type: "connection",
          title: "New connection request",
          body: `${session.user.name} wants to connect with you.`,
          resourceType: "connection",
          resourceId: userId,
          emailTo: candidate.email,
        });
      }
    }
  }

  return apiOk({ decided: parsed.data.decision });
}

const formGroupSchema = z.object({
  name: z.string().trim().min(3).max(120),
  candidateIds: z.array(z.string().min(1)).min(1).max(10),
});

/**
 * Create a group from approved matches sharing the user's objective.
 * All listed candidates must be approved (not merely suggested).
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = formGroupSchema.safeParse(body);
  if (!parsed.success) return apiError("Provide a group name and at least one approved match.", 400);
  const db = getDb();
  const userId = session.user.id;

  const approved = await db
    .select()
    .from(matchResults)
    .where(
      and(
        eq(matchResults.userId, userId),
        eq(matchResults.status, "approved"),
        inArray(matchResults.candidateId, parsed.data.candidateIds),
      ),
    );
  if (approved.length !== parsed.data.candidateIds.length) {
    return apiError("Only approved matches can form a group.", 400);
  }

  const [mine] = await db
    .select()
    .from(matchingProfiles)
    .where(eq(matchingProfiles.userId, userId))
    .limit(1);

  const inserted = await db
    .insert(groups)
    .values({ name: parsed.data.name, objective: mine?.objective ?? null, ownerId: userId })
    .returning({ id: groups.id });
  const groupId = inserted[0].id;
  await db.insert(groupMembers).values({ groupId, userId, role: "admin", status: "active" });
  for (const candidateId of parsed.data.candidateIds) {
    await db.insert(groupMembers).values({ groupId, userId: candidateId, role: "member", status: "active" });
    await notify({
      userId: candidateId,
      type: "group",
      title: `Added to group ${parsed.data.name}`,
      body: `${session.user.name} formed a group around your shared objective.`,
      resourceType: "group",
      resourceId: groupId,
    });
  }

  await audit({ actorId: userId, action: "matching.form_group", targetType: "group", targetId: groupId });
  return apiOk({ groupId }, 201);
}
