import "server-only";
import { sparkChatEndpoint, sparkModel } from "./endpoints";

/**
 * Muse Spark via the Meta Model API Chat Completions protocol
 * (dev.meta.ai/docs/protocols/chat-completions — OpenAI-compatible).
 *
 * Every task here produces validated JSON for JSONB persistence, so the
 * model is always asked for a single JSON object (`response_format:
 * json_object`) and the content is parsed before it leaves this module.
 * Nothing is fabricated: transport, HTTP, and parse failures all surface
 * as errors the caller persists on the task run.
 */

const TASK_INSTRUCTIONS: Record<string, string> = {
  match_score:
    "Score how compatible the seeker is with each candidate collaborator. Weigh shared goals, skills, and availability; state assumptions explicitly.",
  match_explain:
    "Explain in concrete terms why two profiles are compatible collaborators, citing the profile details that matter most.",
  parse_document:
    "Extract exactly the information the goal asks for from the document text. Never invent fields that are not present; mark anything uncertain.",
  project_analysis:
    "Structure the idea into a reviewable project outline: goal, scope, milestones, risks, and open questions.",
  interpret_action:
    "Turn the instruction into a reviewable scheduled action with a clear title, schedule, and parameters. Refuse destructive or ambiguous actions by explaining why.",
  profile_suggest:
    "Propose profile field values strictly from the provided text. Only use fields the schema hint allows.",
  profile_interpret:
    "Interpret the text into profile field values strictly from what was said. Only use fields the schema hint allows.",
  compare_versions:
    "Summarize what changed between two document versions. State assumptions explicitly and flag anything uncertain.",
  summarize_conversation:
    "Summarize the conversation faithfully: what was discussed, decided, and left open.",
  summarize_decisions:
    "Extract the decisions made in the conversation, who made them, and what is still pending.",
  extract_action_items:
    "Extract concrete action items with owners and due hints. Skip vague statements that commit to nothing.",
};

function instructionFor(task: string): string {
  return (
    TASK_INSTRUCTIONS[task] ??
    "Process the input for the requested task and return the result as a JSON object."
  );
}

export interface SparkTaskResult {
  data?: unknown;
  error?: string;
  model: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

function userSafeError(status: number, detail?: string): string {
  if (status === 401 || status === 403) return "The assistant's credentials were rejected. Contact support.";
  if (status === 404) return "The assistant endpoint was not found. Contact support.";
  if (status === 429) return "The assistant is rate-limited right now. Please try again shortly.";
  if (status >= 500) return "The assistant failed. You can retry safely.";
  return detail || `The assistant returned an error (HTTP ${status}). You can retry safely.`;
}

/** Run one structured task. `input` must already be validated + size-bounded by the caller. */
export async function runSparkTask(request: {
  task: string;
  input: unknown;
  schemaHint?: string;
}): Promise<SparkTaskResult> {
  const url = sparkChatEndpoint();
  const key = process.env.MUSE_SPARK_API_KEY;
  const model = sparkModel();
  if (!url || !key) {
    return { model, error: "Muse Spark is not configured" };
  }
  const system =
    `${instructionFor(request.task)} Respond with a single JSON object and nothing else.` +
    (request.schemaHint ? ` Shape: ${request.schemaHint}` : "");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(request.input) },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[muse:spark]", timedOut ? "request timed out" : error instanceof Error ? error.message : error);
    return { model, error: timedOut ? "The assistant timed out. You can retry safely." : "The assistant could not be reached. You can retry safely." };
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as ChatCompletionResponse;
      detail = body.error?.message;
    } catch {
      /* non-JSON error body */
    }
    console.error("[muse:spark]", `HTTP ${res.status}`, detail ?? "");
    return { model, error: userSafeError(res.status, detail) };
  }
  let content: string | null | undefined;
  try {
    const body = (await res.json()) as ChatCompletionResponse;
    content = body.choices?.[0]?.message?.content;
  } catch {
    return { model, error: "The assistant returned an unusable result." };
  }
  if (!content) return { model, error: "The assistant returned an empty result." };
  try {
    return { model, data: JSON.parse(content) as unknown };
  } catch {
    return { model, error: "The assistant returned an unusable result." };
  }
}
