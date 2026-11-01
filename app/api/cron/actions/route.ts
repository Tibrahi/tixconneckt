import { runDueActions } from "@/lib/action-worker";
import { apiError, apiOk } from "@/lib/api-response";

/**
 * Cron entry for the durable action worker. Protected by CRON_SECRET bearer
 * token — Vercel Cron sends it automatically when CRON_SECRET is set;
 * external schedulers must send `Authorization: Bearer <CRON_SECRET>`.
 */
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return apiError("Not authorized.", 401);
  const result = await runDueActions();
  return apiOk(result);
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return apiError("Not authorized.", 401);
  const result = await runDueActions();
  return apiOk(result);
}
