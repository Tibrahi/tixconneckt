import { z } from "zod";
import { getSession } from "@/lib/session";
import { apiError, apiOk } from "@/lib/api-response";
import { determineTaskInputs, getAiTask } from "@/lib/ai-tasks";
import { validateFieldValue } from "@/lib/flexible-records";

const fieldsSchema = z.object({
  taskId: z.string().min(1).max(64),
  available: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Determine the genuinely-required questions for a task given the
 * available context. Asked fields are returned as a validated definition;
 * answered context is echoed back as prefill and never re-asked.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = fieldsSchema.safeParse(body);
  if (!parsed.success) return apiError("Unknown AI task request.", 400);

  const task = getAiTask(parsed.data.taskId);
  if (!task) return apiError("Unknown AI task.", 404);
  if (!task.supported) {
    return apiError(task.unsupportedReason ?? "This task is not supported.", 501);
  }
  const contextProblem = validateFieldValue(parsed.data.available, 0);
  if (contextProblem) return apiError("The provided context is invalid.", 400);

  return apiOk(determineTaskInputs(task, { available: parsed.data.available }));
}
