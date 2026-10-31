import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { connections, profiles, providerLinks, users } from "@/db/schema";

/** Lightweight public preview — safe for discovery listings. */
export interface DiscoveryPreview {
  shortId: string;
  name: string;
  /** Professional headline: major, education, or category. */
  headline: string | null;
  skills: string[];
  fields: string[];
  country: string | null;
  role: string;
  providerKind: string | null;
}

export interface RelationshipSets {
  /** Users with an accepted connection (either direction). */
  connected: Set<string>;
  /** Users with a pending request (either direction). */
  pending: Set<string>;
  /** Users with a rejected/blocked record (either direction). */
  hidden: Set<string>;
}

export interface DiscoveryPaging {
  page: number;
  pageSize: number;
}

/**
 * Parse and clamp pagination params. Pure and unit-tested.
 * Discovery sections default to 5/page; recommendations to 10/page.
 */
export function parseDiscoveryPaging(
  params: URLSearchParams,
  defaultPageSize: number,
  maxPageSize = 20,
): DiscoveryPaging {
  const rawPage = Number(params.get("page") ?? 1);
  const rawSize = Number(params.get("pageSize") ?? defaultPageSize);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const size = Number.isSafeInteger(rawSize) && rawSize > 0 ? rawSize : defaultPageSize;
  return { page, pageSize: Math.min(maxPageSize, size) };
}

/**
 * All relationship ids for one user in a single query. Used to exclude
 * self-adjacent users from discovery and recommendation listings.
 */
export async function getRelationshipSets(db: Database, userId: string): Promise<RelationshipSets> {
  const rows = await db
    .select({
      requesterId: connections.requesterId,
      addresseeId: connections.addresseeId,
      status: connections.status,
    })
    .from(connections)
    .where(or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId)));
  const connected = new Set<string>();
  const pending = new Set<string>();
  const hidden = new Set<string>();
  for (const row of rows) {
    const other = row.requesterId === userId ? row.addresseeId : row.requesterId;
    if (row.status === "accepted") connected.add(other);
    else if (row.status === "pending") pending.add(other);
    else hidden.add(other);
  }
  return { connected, pending, hidden };
}

/** Provider-link counterparts (pending or approved) for exclusion. */
export async function getProviderLinkIds(db: Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ providerId: providerLinks.providerId, individualId: providerLinks.individualId })
    .from(providerLinks)
    .where(
      and(
        or(
          eq(providerLinks.requestedBy, userId),
          eq(providerLinks.providerId, userId),
          eq(providerLinks.individualId, userId),
        ),
        or(eq(providerLinks.status, "pending"), eq(providerLinks.status, "approved")),
      ),
    );
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.providerId !== userId) ids.add(row.providerId);
    if (row.individualId && row.individualId !== userId) ids.add(row.individualId);
  }
  return ids;
}

export interface RecommendableProfile {
  userId: string;
  skills: string[];
  strengths: string[];
  fields: string[];
  major: string | null;
  objectives: string | null;
  educationLevel: string | null;
  country: string | null;
}

export interface RecommendationScore {
  score: number;
  reasons: string[];
}

/**
 * Deterministic relevance score between two profiles. Pure and unit-tested.
 * Shared skills weigh most, then fields/strengths, then same major/country.
 */
export function scoreCandidate(me: RecommendableProfile, candidate: RecommendableProfile): RecommendationScore {
  const reasons: string[] = [];
  let score = 0;
  const overlap = (a: string[], b: string[]): string[] => {
    const set = new Set(b.map((s) => s.toLowerCase()));
    return a.filter((s) => set.has(s.toLowerCase()));
  };
  const sharedSkills = overlap(me.skills, candidate.skills);
  if (sharedSkills.length > 0) {
    score += Math.min(9, sharedSkills.length * 3);
    reasons.push(`Shares ${sharedSkills.length} skill${sharedSkills.length === 1 ? "" : "s"} (${sharedSkills.slice(0, 3).join(", ")})`);
  }
  const sharedFields = overlap(me.fields, candidate.fields);
  if (sharedFields.length > 0) {
    score += Math.min(6, sharedFields.length * 2);
    reasons.push(`Same interest: ${sharedFields.slice(0, 2).join(", ")}`);
  }
  const sharedStrengths = overlap(me.strengths, candidate.strengths);
  if (sharedStrengths.length > 0) {
    score += Math.min(4, sharedStrengths.length * 2);
  }
  if (
    me.major &&
    candidate.major &&
    me.major.toLowerCase() === candidate.major.toLowerCase()
  ) {
    score += 2;
    reasons.push("Same profession");
  }
  if (
    me.country &&
    candidate.country &&
    me.country.toLowerCase() === candidate.country.toLowerCase()
  ) {
    score += 1;
  }
  return { score, reasons };
}

/** Public-visibility predicate: no profile row means public (matches getViewableProfile). */
export function publicProfileFilter() {
  return or(isNull(profiles.userId), eq(profiles.profileVisibility, "public"));
}

export interface PublicListingRow {
  id: string;
  name: string;
  shortId: string;
  country: string | null;
  role: string;
  providerKind: string | null;
  major: string | null;
  educationLevel: string | null;
  category: string;
  skills: string[] | null;
  fields: string[] | null;
}

/**
 * One page of public, active users with minimal preview fields.
 * Exclusions are applied in SQL so the database never ships hidden rows.
 */
export async function listPublicUsers(
  db: Database,
  options: {
    excludeIds: string[];
    providersOnly?: boolean;
    page: number;
    pageSize: number;
  },
): Promise<{ items: DiscoveryPreview[]; total: number }> {
  const { excludeIds, providersOnly = false, page, pageSize } = options;
  const where = and(
    eq(users.status, "active"),
    ...(providersOnly ? [eq(users.role, "provider")] : []),
    publicProfileFilter(),
    ...(excludeIds.length > 0 ? [notInArray(users.id, excludeIds)] : []),
  );
  const offset = (page - 1) * pageSize;
  const rows = (await db
    .select({
      id: users.id,
      name: users.name,
      shortId: users.shortId,
      country: users.country,
      role: users.role,
      providerKind: users.providerKind,
      category: users.category,
      major: profiles.major,
      educationLevel: profiles.educationLevel,
      skills: profiles.skills,
      fields: profiles.fields,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(where)
    .orderBy(users.createdAt)
    .limit(pageSize + 1)
    .offset(offset)) as PublicListingRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  // Total without a second heavy query when the result fits on early pages:
  // run the count only when needed for pagination display.
  let total = offset + pageRows.length + (hasMore ? 1 : 0);
  if (page === 1 && !hasMore) {
    total = pageRows.length;
  } else {
    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(where);
    total = n;
  }
  return {
    items: pageRows.map((r) => ({
      shortId: r.shortId,
      name: r.name,
      headline: r.major ?? r.educationLevel ?? r.category,
      skills: (r.skills ?? []).slice(0, 5),
      fields: (r.fields ?? []).slice(0, 5),
      country: r.country,
      role: r.role,
      providerKind: r.providerKind,
    })),
  total,
  };
}
