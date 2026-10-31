import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { groupMedia, groupMembers, groups } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { getSession } from "@/lib/session";
import { buildStorageKey, deletePrivateObject, downloadPrivateObject, sniffContentKind, uploadPrivateObject } from "@/lib/storage";

const allowed = new Set(["avatar", "cover"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function membership(groupId: string, userId: string) {
  const db = getDb();
  const [member] = await db.select({ role: groupMembers.role }).from(groupMembers).where(and(
    eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), eq(groupMembers.status, "active"),
  )).limit(1);
  return member;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  if (!(await membership(id, session.user.id))) return new Response(null, { status: 404 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "avatar";
  if (!allowed.has(kind)) return new Response(null, { status: 404 });
  const [media] = await getDb().select().from(groupMedia).where(and(eq(groupMedia.groupId, id), eq(groupMedia.kind, kind))).limit(1);
  if (!media) return new Response(null, { status: 404 });
  const object = await downloadPrivateObject(media.storageKey);
  if (!object) return new Response(null, { status: 404 });
  const body = object.body.buffer.slice(object.body.byteOffset, object.body.byteOffset + object.body.byteLength) as ArrayBuffer;
  return new Response(body, { headers: {
    "Content-Type": object.contentType ?? media.contentType,
    "Content-Length": String(object.body.byteLength),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const member = await membership(id, session.user.id);
  const [group] = await getDb().select({ ownerId: groups.ownerId }).from(groups).where(eq(groups.id, id)).limit(1);
  if (!member || !group) return apiError("Group not found.", 404);
  if (member.role !== "admin" && group.ownerId !== session.user.id) return apiError("Only group admins can change group images.", 403);
  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (typeof kind !== "string" || !allowed.has(kind) || !(file instanceof File)) return apiError("Choose a group photo or cover.", 400);
  if (!imageTypes.has(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024) return apiError("Use a JPEG, PNG, or WebP image up to 2 MB.", 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniffContentKind(bytes) !== file.type) return apiError("The image content does not match its file type.", 400);
  const key = buildStorageKey(session.user.id, `groups/${id}`, `${kind}.webp`);
  const uploaded = await uploadPrivateObject(key, bytes, file.type);
  if (!uploaded.ok) return apiError("Group media storage is unavailable. Please try again later.", 503);
  const db = getDb();
  let previous: { storageKey: string } | undefined;
  try {
    [previous] = await db.select({ storageKey: groupMedia.storageKey }).from(groupMedia)
      .where(and(eq(groupMedia.groupId, id), eq(groupMedia.kind, kind))).limit(1);
    await db.insert(groupMedia).values({ groupId: id, kind, contentType: file.type, storageKey: key })
      .onConflictDoUpdate({ target: [groupMedia.groupId, groupMedia.kind], set: { contentType: file.type, storageKey: key, updatedAt: new Date() } });
  } catch (error) {
    await deletePrivateObject(key).catch(() => undefined);
    throw error;
  }
  if (previous?.storageKey) await deletePrivateObject(previous.storageKey).catch(() => undefined);
  return Response.json({ ok: true });
}
