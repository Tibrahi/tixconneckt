import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, users } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import {
  getProviderLinkIds,
  getRelationshipSets,
  listPublicUsers,
  parseDiscoveryPaging,
  publicProfileFilter,
  scoreCandidate,
  type DiscoveryPreview,
  type RecommendableProfile,
} from "@/lib/discovery";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

const TYPES = ["users", "providers", "recommended", "recommended-providers"] as const;
type DiscoveryType = (typeof TYPES)[number];

/**
 * Unified discovery endpoint. Privacy is enforced in SQL, never by
 * frontend filtering: only active users with public profiles are listed,
 * the caller and all adjacent users are excluded server-side.
 *
 * - users: public users, 5 per page by default
 * - providers: public providers only, 5 per page by default
 * - recommended: scored public users, 10 per page
 * - recommended-providers: scored public providers, 10 per page
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as DiscoveryType | null;
  if (!type || !TYPES.includes(type)) {
    return apiError("Unknown discovery type.", 400);
  }

  const rl = await rateLimit("discovery", session.user.id, 120, "10 m");
  if (!rl.allowed) return apiError("Too many requests. Please try again later.", 429);

  const userId = session.user.id;
  const db = getDb();
  const isRecommendation = type === "recommended" || type === "recommended-providers";
  const { page, pageSize } = parseDiscoveryPaging(
    url.searchParams,
    isRecommendation ? 10 : 5,
    isRecommendation ? 10 : 20,
  );

  const relations = await getRelationshipSets(db, userId);
  const excluded = new Set<string>([
    userId,
    ...relations.connected,
    ...relations.pending,
    ...relations.hidden,
  ]);

  if (type === "users" || type === "providers") {
    if (type === "providers") {
      for (const id of await getProviderLinkIds(db, userId)) excluded.add(id);
    }
    const result = await listPublicUsers(db, {
      excludeIds: [...excluded],
      providersOnly: type === "providers",
      page,
      pageSize,
    });
    return apiOk({ ...result, page, pageSize });
  }

  // Recommendations: score a bounded candidate pool, never the whole table.
  const providersOnly = type === "recommended-providers";
  if (providersOnly) {
    for (const id of await getProviderLinkIds(db, userId)) excluded.add(id);
  }
  const [me] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const [meUser] = await db
    .select({ country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const meProfile: RecommendableProfile = {
    userId,
    skills: me?.skills ?? [],
    strengths: me?.strengths ?? [],
    fields: me?.fields ?? [],
    major: me?.major ?? null,
    objectives: me?.objectives ?? null,
    educationLevel: me?.educationLevel ?? null,
    country: meUser?.country ?? null,
  };

  const CANDIDATE_POOL = 200;
  const excludeList = [...excluded];
  const candidates = await db
    .select({
      userId: users.id,
      shortId: users.shortId,
      name: users.name,
      country: users.country,
      role: users.role,
      providerKind: users.providerKind,
      category: users.category,
      major: profiles.major,
      objectives: profiles.objectives,
      educationLevel: profiles.educationLevel,
      skills: profiles.skills,
      strengths: profiles.strengths,
      fields: profiles.fields,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.status, "active"),
        ...(providersOnly ? [eq(users.role, "provider")] : []),
        ...(providersOnly ? [sql`EXISTS (SELECT 1 FROM organization_members om JOIN organizations o ON o.id = om.organization_id WHERE om.user_id = users.id AND om.status = 'active' AND om.role IN ('owner', 'admin') AND o.owner_id = users.id AND o.kind = 'provider' AND o.category = users.provider_kind AND o.verification_status = 'verified')`] : []),
        publicProfileFilter(),
        ...(excludeList.length > 0 ? [notInArray(users.id, excludeList)] : []),
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(CANDIDATE_POOL);

  const scored = candidates
    .map((c) => {
      const candidate: RecommendableProfile = {
        userId: c.userId,
        skills: c.skills ?? [],
        strengths: c.strengths ?? [],
        fields: c.fields ?? [],
        major: c.major ?? null,
        objectives: c.objectives ?? null,
        educationLevel: c.educationLevel ?? null,
        country: c.country,
      };
      const { score, reasons } = scoreCandidate(meProfile, candidate);
      const preview: DiscoveryPreview = {
        shortId: c.shortId,
        name: c.name,
        headline: c.major ?? c.educationLevel ?? c.category,
        skills: (c.skills ?? []).slice(0, 5),
        fields: (c.fields ?? []).slice(0, 5),
        country: c.country,
        role: c.role,
        providerKind: c.providerKind,
      };
      return { ...preview, score, reasons };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const total = scored.length;
  const items = scored.slice((page - 1) * pageSize, page * pageSize);
  return apiOk({ items, total, page, pageSize });
}
