import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { groupMembers, supportRequestDocuments, supportRequestEvents, supportRequests } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

const revokeSchema = z.object({ grantId: z.string().uuid() });

/** The requester can revoke a recipient's future access to a shared file. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return apiError("Choose a valid shared file.", 400);
  const db = getDb();
  const [request] = await db.select().from(supportRequests).where(eq(supportRequests.id, id)).limit(1);
  if (!request) return apiError("Support request not found.", 404);
  let allowed = request.requesterUserId === session.user.id;
  if (!allowed && request.requesterGroupId) {
    const [member] = await db.select({ id: groupMembers.id }).from(groupMembers).where(and(
      eq(groupMembers.groupId, request.requesterGroupId), eq(groupMembers.userId, session.user.id), eq(groupMembers.role, "admin"), eq(groupMembers.status, "active"),
    )).limit(1);
    allowed = Boolean(member);
  }
  if (!allowed) return apiError("Only the requester or an authorized group admin can revoke shared files.", 403);
  const [grant] = await db.update(supportRequestDocuments).set({ expiresAt: new Date() }).where(and(
    eq(supportRequestDocuments.id, parsed.data.grantId), eq(supportRequestDocuments.requestId, id),
  )).returning({ documentId: supportRequestDocuments.documentId });
  if (!grant) return apiError("Shared file not found.", 404);
  await db.insert(supportRequestEvents).values({ requestId: id, actorId: session.user.id, event: "document_access_revoked", note: "A shared file access grant was revoked." });
  return apiOk({ revoked: true });
}
