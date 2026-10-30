import { and, desc, eq, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { aiTaskRuns, messageHides, messages, users } from "@/db/schema";
import { callMuseSpark, validateSparkJson } from "@/lib/ai";
import { aiSparkConfigured } from "@/lib/config";
import { apiError, apiOk } from "@/lib/api-response";
import { requireConversationMembership } from "@/lib/chat";
import { validateFieldValue } from "@/lib/flexible-records";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { chatSummarizeSchema } from "@/lib/validation";

/**
 * Member's AI runs for this conversation (summaries, decisions, actions).
 * Results render from the stored record — never from assumed shapes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  const db = getDb();
  const runs = await db
    .select({
      id: aiTaskRuns.id,
      taskId: aiTaskRuns.taskId,
      status: aiTaskRuns.status,
      resultJson: aiTaskRuns.resultJson,
      error: aiTaskRuns.error,
      createdAt: aiTaskRuns.createdAt,
      userName: users.name,
    })
    .from(aiTaskRuns)
    .innerJoin(users, eq(users.id, aiTaskRuns.userId))
    .where(eq(aiTaskRuns.conversationId, id))
    .orderBy(desc(aiTaskRuns.createdAt))
    .limit(20);
  return apiOk({ runs, sparkConfigured: aiSparkConfigured() });
}

const SCHEMA_HINTS: Record<string, string> = {
  summarize_conversation:
    "{ summary: string, keyPoints: string[], openQuestions?: string[] }",
  summarize_decisions:
    "{ decisions: [{ decision: string, decidedBy?: string, at?: string }], pending?: string[] }",
  extract_action_items:
    "{ actionItems: [{ item: string, owner?: string, dueHint?: string }] }",
};

/**
 * Run an explicit, consented AI task over recent conversation messages.
 * Only the requesting member's visible messages are sent (their hides and
 * tombstones respected); nothing runs without this deliberate request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-summarize", session.user.id, 10, "1 h");
  if (!rl.allowed) return apiError("Too many AI requests. Please try again later.", 429);

  const { id } = await params;
  const membership = await requireConversationMembership(id, session.user.id);
  if (!membership) return apiError("You are not a member of this conversation.", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = chatSummarizeSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid AI request.", 400);
  if (!aiSparkConfigured()) {
    return apiError("Muse Spark is not configured, so summaries are unavailable.", 503);
  }

  const db = getDb();
  const hiddenIds = db
    .select({ id: messageHides.messageId })
    .from(messageHides)
    .where(eq(messageHides.userId, session.user.id));

  const rows = await db
    .select({ body: messages.body, createdAt: messages.createdAt, senderName: users.name })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.conversationId, id),
        eq(messages.kind, "user"),
        notInArray(messages.id, hiddenIds),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(parsed.data.limit);
  const transcript = rows
    .reverse()
    .map((r) => ({ sender: r.senderName ?? "Member", at: r.createdAt.toISOString(), body: r.body.slice(0, 2000) }));
  if (transcript.length === 0) {
    return apiError("There are no messages to summarize yet.", 400);
  }

  const inputJson: Record<string, unknown> = {
    goal: parsed.data.goal ?? "",
    messageCount: transcript.length,
    messages: transcript,
  };
  const inputProblem = validateFieldValue(inputJson, 0);
  if (inputProblem) return apiError("The conversation selection is too large to summarize.", 400);

  const [run] = await db
    .insert(aiTaskRuns)
    .values({ userId: session.user.id, conversationId: id, taskId: parsed.data.taskId, inputJson, status: "processing" })
    .returning({ id: aiTaskRuns.id });

  const spark = await callMuseSpark({
    task: parsed.data.taskId,
    input: inputJson,
    schemaHint: SCHEMA_HINTS[parsed.data.taskId],
  });
  if (spark.error || !spark.data) {
    await db
      .update(aiTaskRuns)
      .set({ status: "failed", error: spark.error ?? "AI request failed", finishedAt: new Date() })
      .where(eq(aiTaskRuns.id, run.id));
    return apiError(spark.error ?? "AI request failed. You can retry safely.", 502);
  }
  const validated = validateSparkJson(spark.data);
  if (!validated.ok) {
    await db
      .update(aiTaskRuns)
      .set({ status: "failed", error: validated.error, finishedAt: new Date() })
      .where(eq(aiTaskRuns.id, run.id));
    return apiError("The assistant returned an unusable result.", 502);
  }
  await db
    .update(aiTaskRuns)
    .set({ status: "succeeded", resultJson: validated.doc, model: "muse-spark", finishedAt: new Date() })
    .where(eq(aiTaskRuns.id, run.id));

  return apiOk({ runId: run.id, status: "succeeded", result: validated.doc });
}
