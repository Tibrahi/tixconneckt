import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { organizationMembers, organizations } from "@/db/schema";

/** A provider can receive new work only through an actively verified service organization. */
export async function hasVerifiedProviderService(userId: string, kind: "loan" | "support"): Promise<boolean> {
  const [organization] = await getDb().select({ id: organizations.id })
    .from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
      inArray(organizationMembers.role, ["owner", "admin"]),
      eq(organizations.ownerId, userId),
      eq(organizations.kind, "provider"),
      eq(organizations.category, kind),
      eq(organizations.verificationStatus, "verified"),
    )).limit(1);
  return Boolean(organization);
}
