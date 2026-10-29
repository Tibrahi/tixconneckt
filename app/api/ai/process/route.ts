import { z } from "zod";
import { getDb } from "@/db";
import { flexibleRecords } from "@/db/schema";
import { callMuseSpark, validateSparkJson } from "@/lib/ai";
import { getAiTask } from "@/lib/ai-tasks";
import { apiError, apiOk } from "@/lib/api-response";
import {
  validateDocSize,
  validateFieldName,
  validateFieldValue,
} from "@/lib/flexible-records";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

const processSchema = z.object({
  taskId: z.string().min(1).max(64),
  /** Collected answers: asked fields + carried prefill + user custom fields. */
  values: z.record(z.string(), z.unknown()),
  recordType: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .default("ai_result"),
  projectId: z.string().min(1).max(128).optional(),
});

/**
 * Run a dynamic Muse Spark task: validate the collected input, submit it
 * to the configured integration, validate the returned JSON generically,
 * and persist it as a flexible record. The saved record — not an assumed
 * shape — is what the UI renders.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("ai-process", session.user.id, 20, "10 m");
  if (!rl.allowed) return apiError("Too many AI requests. Please try again shortly.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = processSchema.safeParse(body);
  if (!parsed.success) return apiError("Check the submitted values and retry.", 400);

  const task = getAiTask(parsed.data.taskId);
  if (!task) return apiError("Unknown AI task.", 404);
  if (!task.supported) {
    return apiError(task.unsupportedReason ?? "This task is not supported.", 501);
  }
  if (task.engine !== "spark") {
    return apiError("Voice tasks run through the voice workflow.", 400);
  }

  for (const [key, value] of Object.entries(parsed.data.values)) {
    const nameProblem = validateFieldName(key);
    if (nameProblem) return apiError(`Invalid field "${key}": ${nameProblem}`, 400);
    const valueProblem = validateFieldValue(value, 0);
    if (valueProblem) return apiError(`Invalid value for "${key}": ${valueProblem}`, 400);
  }
  const sizeProblem = validateDocSize(parsed.data.values);
  if (sizeProblem) return apiError(sizeProblem, 400);

  const spark = await callMuseSpark({
    task: task.id,
    input: { ...parsed.data.values, projectId: parsed.data.projectId },
  });
  if (!spark.configured) {
    // Input is echoed back so the UI preserves it; nothing is simulated.
    return apiOk({
      pending: true,
      pendingReason: spark.pendingReason,
      values: parsed.data.values,
    });
  }
  if (spark.error || spark.data === undefined) {
    return apiError(spark.error ?? "The assistant failed. Your input is preserved — retry when ready.", 502);
  }
  const validated = validateSparkJson(spark.data);
  if (!validated.ok) {
    return apiError(validated.error, 502);
  }
  const doc = validated.doc;

  const db = getDb();
  const [record] = await db
    .insert(flexibleRecords)
    .values({
      recordType: parsed.data.recordType,
      ownerId: session.user.id,
      visibility: "private",
      doc,
      provenance: {
        source: "muse_spark",
        task: task.id,
        projectId: parsed.data.projectId,
        inputKeys: Object.keys(parsed.data.values),
        producedAt: new Date().toISOString(),
      },
    })
    .returning();

  return apiOk({ pending: false, record }, 201);
}
