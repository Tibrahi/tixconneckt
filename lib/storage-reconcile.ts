/**
 * Read-only storage reconciliation (role-aware spec §A4). Pure functions —
 * the admin route supplies database references and bucket keys; this module
 * classifies them without touching storage. No cleanup, migration, or
 * deletion lives here: orphans are reported for reviewed action only.
 */

export type StorageRefTable = "documents" | "profile_media" | "group_media";

export interface DbStorageRef {
  /** Storage key, or null for PostgreSQL-byte fallback rows. */
  key: string | null;
  table: StorageRefTable;
  /** Row id for audit samples (never exposed with contents). */
  rowId: string;
  /** Module/key prefix when the row carries one (documents.module). */
  module?: string | null;
  /** True when the row also/instead holds bytes in PostgreSQL. */
  hasBytes: boolean;
}

export interface BucketEntry {
  key: string;
  sizeBytes: number;
  lastModified: string | null;
}

export interface ReconciliationReport {
  counts: {
    dbRefs: number;
    bucketObjects: number;
    linked: number;
    missingObjects: number;
    unlinkedObjects: number;
    postgresFallback: number;
    duplicateRefs: number;
  };
  /** Key prefix → unlinked object count (module/prefix when available). */
  unlinkedByPrefix: Record<string, number>;
  /** Total bytes held by unlinked objects. */
  unlinkedBytes: number;
  truncated: boolean;
}

export interface ReconciliationSamples {
  missing: Array<{ key: string; table: StorageRefTable; rowId: string }>;
  unlinked: BucketEntry[];
  duplicates: Array<{ key: string; tables: StorageRefTable[] }>;
}

function prefixOf(key: string): string {
  const head = key.split("/")[0];
  return head && head.length <= 64 ? head : "(other)";
}

/**
 * Classify database references against bucket keys. Separately identifies
 * linked rows, missing objects referenced by rows, unlinked objects,
 * PostgreSQL-byte fallback rows, and duplicate references to one key.
 */
export function reconcileStorage(
  refs: DbStorageRef[],
  bucket: BucketEntry[],
  truncated = false,
): ReconciliationReport {
  const bucketKeys = new Set(bucket.map((o) => o.key));
  const refsByKey = new Map<string, DbStorageRef[]>();
  let postgresFallback = 0;
  for (const ref of refs) {
    if (!ref.key) {
      if (ref.hasBytes) postgresFallback += 1;
      continue;
    }
    const list = refsByKey.get(ref.key) ?? [];
    list.push(ref);
    refsByKey.set(ref.key, list);
  }
  let linked = 0;
  let missingObjects = 0;
  let duplicateRefs = 0;
  for (const [key, rows] of refsByKey) {
    if (rows.length > 1) duplicateRefs += 1;
    if (bucketKeys.has(key)) linked += 1;
    else missingObjects += 1;
  }
  const unlinkedByPrefix: Record<string, number> = {};
  let unlinkedObjects = 0;
  let unlinkedBytes = 0;
  for (const obj of bucket) {
    if (refsByKey.has(obj.key)) continue;
    unlinkedObjects += 1;
    unlinkedBytes += obj.sizeBytes;
    const prefix = prefixOf(obj.key);
    unlinkedByPrefix[prefix] = (unlinkedByPrefix[prefix] ?? 0) + 1;
  }
  return {
    counts: {
      dbRefs: refs.length,
      bucketObjects: bucket.length,
      linked,
      missingObjects,
      unlinkedObjects,
      postgresFallback,
      duplicateRefs,
    },
    unlinkedByPrefix,
    unlinkedBytes,
    truncated,
  };
}

/** Capped audit samples for the report — keys and ids only, never contents. */
export function sampleReconciliation(
  refs: DbStorageRef[],
  bucket: BucketEntry[],
  limit = 50,
): ReconciliationSamples {
  const bucketKeys = new Set(bucket.map((o) => o.key));
  const refsByKey = new Map<string, DbStorageRef[]>();
  for (const ref of refs) {
    if (!ref.key) continue;
    const list = refsByKey.get(ref.key) ?? [];
    list.push(ref);
    refsByKey.set(ref.key, list);
  }
  const missing: ReconciliationSamples["missing"] = [];
  const duplicates: ReconciliationSamples["duplicates"] = [];
  for (const [key, rows] of refsByKey) {
    if (rows.length > 1 && duplicates.length < limit) {
      duplicates.push({ key, tables: rows.map((r) => r.table) });
    }
    if (!bucketKeys.has(key) && missing.length < limit) {
      missing.push({ key, table: rows[0].table, rowId: rows[0].rowId });
    }
  }
  const unlinked = bucket.filter((o) => !refsByKey.has(o.key)).slice(0, limit);
  return { missing, unlinked, duplicates };
}

export type ResolveResult =
  | { status: "linked"; table: StorageRefTable; rowIds: string[] }
  | { status: "fallback"; table: StorageRefTable; rowId: string }
  | { status: "unlinked" };

/**
 * Tested resolver for valid records: given one storage key (or, for
 * fallback rows, a table+row id), report how the database references it.
 * Read-only — callers decide what, if anything, to do next.
 */
export function resolveStorageRef(
  refs: DbStorageRef[],
  query: { key: string } | { table: StorageRefTable; rowId: string },
): ResolveResult {
  if ("key" in query) {
    const rows = refs.filter((r) => r.key === query.key);
    if (rows.length === 0) return { status: "unlinked" };
    return { status: "linked", table: rows[0].table, rowIds: rows.map((r) => r.rowId) };
  }
  const row = refs.find((r) => r.table === query.table && r.rowId === query.rowId);
  if (!row || row.key || !row.hasBytes) return { status: "unlinked" };
  return { status: "fallback", table: row.table, rowId: row.rowId };
}
