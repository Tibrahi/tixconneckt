import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

/** Paginated notification list with real read/unread states. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const db = getDb();
  const filter = and(
    eq(notifications.userId, session.user.id),
    unreadOnly ? isNull(notifications.readAt) : undefined,
  );
  const rows = await db
    .select()
    .from(notifications)
    .where(filter)
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [total] = await db.select({ n: count() }).from(notifications).where(filter);

  return apiOk({ items: rows, page, pageSize, total: total?.n ?? 0 });
}

const markSchema = z.object({
  id: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

/** Mark one notification (or all) as read. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = markSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request.", 400);

  const db = getDb();
  if (parsed.data.all) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)),
      );
    return apiOk({ marked: "all" });
  }
  if (!parsed.data.id) return apiError("Provide a notification id.", 400);
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data.id),
        eq(notifications.userId, session.user.id),
      ),
    )
    .returning({ id: notifications.id });
  if (updated.length === 0) return apiError("Notification not found.", 404);
  return apiOk({ marked: parsed.data.id });
}
