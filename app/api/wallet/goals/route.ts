import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { groupMembers, savingsGoals } from "@/db/schema";
import { apiError, apiOk } from "@/lib/api-response";
import { getSession } from "@/lib/session";

const goalSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().trim().min(3).max(120),
  kind: z.enum(["targeted", "general"]).default("general"),
  targetMinor: z.number().int().positive().optional(),
  minMinor: z.number().int().positive().optional(),
  maxMinor: z.number().int().positive().optional(),
  currency: z.string().trim().length(3).default("USD"),
});

/** Group admin creates a targeted or general savings goal with thresholds. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = goalSchema.safeParse(body);
  if (!parsed.success) return apiError("Provide a goal name and valid thresholds.", 400);

  const db = getDb();
  const [admin] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, parsed.data.groupId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.role, "admin"),
      ),
    )
    .limit(1);
  if (!admin) return apiError("Only group admins can create savings goals.", 403);

  const [goal] = await db
    .insert(savingsGoals)
    .values({
      groupId: parsed.data.groupId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      targetMinor: parsed.data.targetMinor,
      minMinor: parsed.data.minMinor,
      maxMinor: parsed.data.maxMinor,
      currency: parsed.data.currency,
      createdBy: session.user.id,
    })
    .returning({ id: savingsGoals.id });
  return apiOk({ goalId: goal.id }, 201);
}
