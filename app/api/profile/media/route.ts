import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, profileMedia, profiles, users } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { buildStorageKey, deletePrivateObject, downloadPrivateObject, sniffContentKind, uploadPrivateObject } from "@/lib/storage";

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(request.url);
  const shortId = url.searchParams.get("shortId")?.toUpperCase();
  const kind = url.searchParams.get("kind");
  if (!shortId || (kind !== "avatar" && kind !== "cover")) return new Response(null, { status: 404 });
  const db = getDb();
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.shortId, shortId)).limit(1);
  if (!owner) return new Response(null, { status: 404 });
  if (owner.id !== session.user.id) {
    const [profile] = await db.select({ visibility: profiles.profileVisibility }).from(profiles).where(eq(profiles.userId, owner.id)).limit(1);
    if (profile?.visibility === "connections") {
      const [accepted] = await db.select({ id: connections.id }).from(connections).where(and(
        eq(connections.status, "accepted"),
        or(
          and(eq(connections.requesterId, session.user.id), eq(connections.addresseeId, owner.id)),
          and(eq(connections.requesterId, owner.id), eq(connections.addresseeId, session.user.id)),
        ),
      )).limit(1);
      if (!accepted) return new Response(null, { status: 404 });
    }
  }
  const [media] = await db.select({ data: profileMedia.data, storageKey: profileMedia.storageKey, contentType: profileMedia.contentType, updatedAt: profileMedia.updatedAt })
    .from(profileMedia)
    .where(and(eq(profileMedia.userId, owner.id), eq(profileMedia.kind, kind)))
    .limit(1);
  if (!media) return new Response(null, { status: 404 });
  const storedObject = media.storageKey ? await downloadPrivateObject(media.storageKey) : null;
  if (media.storageKey && !storedObject) return new Response(null, { status: 404 });
  const bytes = storedObject?.body ?? media.data;
  if (!bytes) return new Response(null, { status: 404 });
  const imageBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(imageBody, {
    headers: {
      "Content-Type": storedObject?.contentType ?? media.contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=300",
      ETag: `W/"${media.updatedAt.getTime()}-${bytes.byteLength}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if ((kind !== "avatar" && kind !== "cover") || !(file instanceof File)) {
    return apiError("Choose a profile or cover image.", 400);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size === 0 || file.size > MAX_PROFILE_IMAGE_BYTES) {
    return apiError("Use a JPEG, PNG, or WebP image up to 2 MB.", 400);
  }
  const data = Buffer.from(await file.arrayBuffer());
  if (sniffContentKind(data) !== file.type) return apiError("The image content does not match its file type.", 400);
  const key = buildStorageKey(session.user.id, "profile", `${kind}.webp`);
  const uploaded = await uploadPrivateObject(key, data, file.type);
  if (!uploaded.ok) return apiError("Profile media storage is unavailable. Please try again later.", 503);
  const db = getDb();
  let previous: { storageKey: string | null } | undefined;
  try {
    [previous] = await db.select({ storageKey: profileMedia.storageKey }).from(profileMedia)
      .where(and(eq(profileMedia.userId, session.user.id), eq(profileMedia.kind, kind))).limit(1);
    await db.insert(profileMedia).values({ userId: session.user.id, kind, contentType: file.type, data: null, storageKey: key })
      .onConflictDoUpdate({
        target: [profileMedia.userId, profileMedia.kind],
        set: { contentType: file.type, data: null, storageKey: key, updatedAt: new Date() },
      });
  } catch (error) {
    await deletePrivateObject(key).catch(() => undefined);
    throw error;
  }
  if (previous?.storageKey) await deletePrivateObject(previous.storageKey).catch(() => undefined);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "avatar" && kind !== "cover") return apiError("Choose a valid image type.", 400);
  const db = getDb();
  const [previous] = await db.select({ storageKey: profileMedia.storageKey }).from(profileMedia)
    .where(and(eq(profileMedia.userId, session.user.id), eq(profileMedia.kind, kind))).limit(1);
  await db.delete(profileMedia).where(and(eq(profileMedia.userId, session.user.id), eq(profileMedia.kind, kind)));
  if (previous?.storageKey) await deletePrivateObject(previous.storageKey).catch(() => undefined);
  return Response.json({ ok: true });
}
