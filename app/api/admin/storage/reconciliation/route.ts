import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, groupMedia, profileMedia } from "@/db/schema";
import { apiError, apiOk, clientIp } from "@/lib/api-response";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/roles";
import { listBucketKeys } from "@/lib/storage";
import { objectStorageConfigured } from "@/lib/storage-config";
import {
  reconcileStorage,
  sampleReconciliation,
  type DbStorageRef,
} from "@/lib/storage-reconcile";

/** Cap per table so the report never loads an unbounded reference set. */
const MAX_REFS_PER_TABLE = 20000;

/**
 * Read-only Neon storage reconciliation (role-aware §A4, admin only).
 * Compares database references (documents, profile_media, group_media)
 * against the `tixconneckt` bucket inventory and classifies linked,
 * missing, unlinked, fallback, and duplicate records. Keys and ids only —
 * never contents or signed URLs. No cleanup happens here.
 */
export async function GET(req: Request) {
  const { actor, response } = await requireCapability("storage.reconcile.read");
  if (!actor) return response;

  const db = getDb();
  const [docRefs, profileRefs, groupRefs] = await Promise.all([
    db
      .select({
        rowId: documents.id,
        key: documents.storageKey,
        module: documents.module,
        hasBytes: sql<boolean>`${documents.data} IS NOT NULL`,
      })
      .from(documents)
      .limit(MAX_REFS_PER_TABLE + 1),
    db
      .select({
        rowId: profileMedia.userId,
        kind: profileMedia.kind,
        key: profileMedia.storageKey,
        hasBytes: sql<boolean>`${profileMedia.data} IS NOT NULL`,
      })
      .from(profileMedia)
      .limit(MAX_REFS_PER_TABLE + 1),
    db
      .select({
        rowId: groupMedia.groupId,
        kind: groupMedia.kind,
        key: groupMedia.storageKey,
        hasBytes: sql<boolean>`${groupMedia.data} IS NOT NULL`,
      })
      .from(groupMedia)
      .limit(MAX_REFS_PER_TABLE + 1),
  ]);

  const refs: DbStorageRef[] = [
    ...docRefs.slice(0, MAX_REFS_PER_TABLE).map((r) => ({
      key: r.key,
      table: "documents" as const,
      rowId: r.rowId,
      module: r.module,
      hasBytes: r.hasBytes,
    })),
    ...profileRefs.slice(0, MAX_REFS_PER_TABLE).map((r) => ({
      key: r.key,
      table: "profile_media" as const,
      rowId: `${r.rowId}:${r.kind}`,
      module: null,
      hasBytes: r.hasBytes,
    })),
    ...groupRefs.slice(0, MAX_REFS_PER_TABLE).map((r) => ({
      key: r.key,
      table: "group_media" as const,
      rowId: `${r.rowId}:${r.kind}`,
      module: null,
      hasBytes: r.hasBytes,
    })),
  ];
  const dbTruncated =
    docRefs.length > MAX_REFS_PER_TABLE ||
    profileRefs.length > MAX_REFS_PER_TABLE ||
    groupRefs.length > MAX_REFS_PER_TABLE;

  const bucketConfigured = objectStorageConfigured();
  const inventory = bucketConfigured
    ? await listBucketKeys()
    : { objects: [], truncated: false, error: "Neon Object Storage is not configured" };

  const report = reconcileStorage(refs, inventory.objects, inventory.truncated);
  const samples = sampleReconciliation(refs, inventory.objects);

  await audit({
    actorId: actor.userId,
    action: "storage.reconcile.read",
    targetType: "storage",
    targetId: "tixconneckt",
    ipAddress: clientIp(req),
  });

  if (inventory.error && bucketConfigured) {
    return apiError(inventory.error, 502);
  }
  return apiOk({ report, samples, dbTruncated, bucketConfigured });
}
