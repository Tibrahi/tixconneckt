/**
 * Neon Object Storage (S3-compatible) configuration.
 *
 * Kept in its own module without `server-only` so the pure resolution logic
 * stays unit-testable; `lib/storage.ts` builds the S3 client from this.
 *
 * The bucket is `tixconneckt`. Every upload prefers object storage when the
 * endpoint + credentials are configured, and otherwise stores its bytes in
 * Neon PostgreSQL (`documents.data`, `profile_media.data`, `group_media.data`)
 * so uploads never fail with a 502/503 just because object storage is absent.
 */

/** The Neon object-storage bucket used by this application. */
export const STORAGE_BUCKET = "tixconneckt";

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Resolve object-storage configuration from the environment. Pure and
 * unit-tested: pass a custom env record in tests. Returns null when object
 * storage is not fully configured, in which case callers must use the
 * PostgreSQL fallback instead of failing.
 */
export function getStorageConfig(env: Record<string, string | undefined> = process.env): StorageConfig | null {
  const bucket = env.NEON_STORAGE_BUCKET?.trim() || STORAGE_BUCKET;
  const region = env.AWS_REGION?.trim();
  const endpoint = env.AWS_ENDPOINT_URL_S3?.trim();
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!region || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}

/** True when uploads can go to Neon Object Storage right now. */
export function objectStorageConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return getStorageConfig(env) !== null;
}
