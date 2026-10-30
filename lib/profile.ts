import { and, count, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  badges,
  connections,
  fundingRequests,
  groupMembers,
  profiles,
  projects,
  users,
} from "@/db/schema";

export interface OwnProfile {
  id: string;
  shortId: string;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  countryCode: string | null;
  category: string;
  role: string;
  providerKind: string | null;
  educationLevel: string | null;
  objectives: string | null;
  major: string | null;
  skills: string[];
  strengths: string[];
  fields: string[];
  bio: string | null;
  location: string | null;
  contactVisibility: string;
  financialVisibility: string;
  profileVisibility: string;
  avatarUrl: string;
  coverPhotoUrl: string;
  groupCount: number;
  connectionCount: number;
  badges: Array<{ type: string; reason: string | null; awardedAt: Date }>;
  fundingStatus: { open: number; funded: number };
  projectCount: number;
}

/** Full profile for the owner (all fields, all counts from real records). */
export async function getOwnProfile(userId: string): Promise<OwnProfile | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);

  const [groupCount] = await db
    .select({ n: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));

  const [connectionCount] = await db
    .select({ n: count() })
    .from(connections)
    .where(
      and(
        or(eq(connections.requesterId, userId), eq(connections.addresseeId, userId)),
        eq(connections.status, "accepted"),
      ),
    );

  const [projectCount] = await db
    .select({ n: count() })
    .from(projects)
    .where(eq(projects.ownerId, userId));

  const userBadges = await db
    .select({ type: badges.type, reason: badges.reason, awardedAt: badges.awardedAt })
    .from(badges)
    .where(eq(badges.userId, userId));

  const myProjectIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  const funding = await db
    .select({ status: fundingRequests.status })
    .from(fundingRequests)
    .where(
      or(
        and(eq(fundingRequests.requesterType, "individual"), eq(fundingRequests.requesterId, userId)),
        inArray(fundingRequests.projectId, myProjectIds),
      ),
    )
    .limit(200);

  return {
    id: user.id,
    shortId: user.shortId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    country: user.country,
    countryCode: user.countryCode,
    category: user.category,
    role: user.role,
    providerKind: user.providerKind,
    educationLevel: profile?.educationLevel ?? null,
    objectives: profile?.objectives ?? null,
    major: profile?.major ?? null,
    skills: profile?.skills ?? [],
    strengths: profile?.strengths ?? [],
    fields: profile?.fields ?? [],
    bio: profile?.bio ?? null,
    location: profile?.location ?? null,
    contactVisibility: profile?.contactVisibility ?? "connections",
    financialVisibility: profile?.financialVisibility ?? "private",
    profileVisibility: profile?.profileVisibility ?? "public",
    avatarUrl: `/api/profile/media?shortId=${encodeURIComponent(user.shortId)}&kind=avatar`,
    coverPhotoUrl: `/api/profile/media?shortId=${encodeURIComponent(user.shortId)}&kind=cover`,
    groupCount: groupCount?.n ?? 0,
    connectionCount: connectionCount?.n ?? 0,
    badges: userBadges,
    fundingStatus: {
      open: funding.filter((f) => ["draft", "pending", "under_review", "approved"].includes(f.status)).length,
      funded: funding.filter((f) => f.status === "funded").length,
    },
    projectCount: projectCount?.n ?? 0,
  };
}

export interface ViewableProfile {
  shortId: string;
  name: string;
  category: string;
  country: string | null;
  location: string | null;
  educationLevel: string | null;
  objectives: string | null;
  major: string | null;
  skills: string[];
  strengths: string[];
  fields: string[];
  bio: string | null;
  email: string | null;
  phone: string | null;
  groupCount: number;
  connectionCount: number;
  projectCount: number;
  badges: Array<{ type: string; reason: string | null }>;
  connectionStatus: "none" | "pending_out" | "pending_in" | "accepted";
  profileVisibility: string;
  limitedProfile: boolean;
  avatarUrl: string;
  coverPhotoUrl: string;
}

/**
 * Permission-filtered profile for Conneckt lookups. Contact details follow
 * the owner's visibility preference and the viewer's relationship.
 */
export async function getViewableProfile(
  viewerId: string,
  shortId: string,
): Promise<ViewableProfile | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.shortId, shortId)).limit(1);
  if (!user || user.status !== "active") return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);

  const links = await db
    .select()
    .from(connections)
    .where(
      or(
        and(eq(connections.requesterId, viewerId), eq(connections.addresseeId, user.id)),
        and(eq(connections.requesterId, user.id), eq(connections.addresseeId, viewerId)),
      ),
    )
    .limit(1);
  const link = links[0];
  const connectionStatus: ViewableProfile["connectionStatus"] =
    !link || link.status === "rejected" || link.status === "blocked"
      ? "none"
      : link.status === "accepted"
        ? "accepted"
        : link.requesterId === viewerId
          ? "pending_out"
          : "pending_in";

  const visibility = profile?.contactVisibility ?? "connections";
  const isSelf = viewerId === user.id;
  const canSeeContact =
    isSelf || visibility === "public" || (visibility === "connections" && connectionStatus === "accepted");
  const profileMode = profile?.profileVisibility ?? "public";
  const canSeeDetails = isSelf || profileMode === "public" ||
    (profileMode === "connections" && connectionStatus === "accepted");

  const [groupCount] = await db
    .select({ n: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, user.id), eq(groupMembers.status, "active")));
  const [connectionCount] = await db
    .select({ n: count() })
    .from(connections)
    .where(
      and(
        or(eq(connections.requesterId, user.id), eq(connections.addresseeId, user.id)),
        eq(connections.status, "accepted"),
      ),
    );
  const [projectCount] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.ownerId, user.id), eq(projects.visibility, "public")));
  const userBadges = await db
    .select({ type: badges.type, reason: badges.reason })
    .from(badges)
    .where(eq(badges.userId, user.id));

  return {
    shortId: user.shortId,
    name: user.name,
    category: user.category,
    country: canSeeDetails ? user.country : null,
    location: canSeeDetails ? profile?.location ?? null : null,
    educationLevel: canSeeDetails ? profile?.educationLevel ?? null : null,
    objectives: canSeeDetails ? profile?.objectives ?? null : null,
    major: canSeeDetails ? profile?.major ?? null : null,
    skills: canSeeDetails ? profile?.skills ?? [] : [],
    strengths: canSeeDetails ? profile?.strengths ?? [] : [],
    fields: canSeeDetails ? profile?.fields ?? [] : [],
    bio: canSeeDetails ? profile?.bio ?? null : null,
    email: canSeeContact ? user.email : null,
    phone: canSeeContact ? user.phone : null,
    groupCount: canSeeDetails ? groupCount?.n ?? 0 : 0,
    connectionCount: canSeeDetails ? connectionCount?.n ?? 0 : 0,
    projectCount: canSeeDetails ? projectCount?.n ?? 0 : 0,
    badges: canSeeDetails ? userBadges : [],
    connectionStatus,
    profileVisibility: profileMode,
    limitedProfile: !canSeeDetails,
    avatarUrl: `/api/profile/media?shortId=${encodeURIComponent(user.shortId)}&kind=avatar`,
    coverPhotoUrl: `/api/profile/media?shortId=${encodeURIComponent(user.shortId)}&kind=cover`,
  };
}
