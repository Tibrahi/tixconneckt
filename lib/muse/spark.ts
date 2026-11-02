import "server-only";
import { sparkChatEndpoint, sparkModel } from "./endpoints";

/**
 * Muse Spark via the Meta Model API Chat Completions protocol
 * (dev.meta.ai/docs/protocols/chat-completions — OpenAI-compatible).
 *
 * Tasks return JSON parsed before it leaves this module. A task with a fixed
 * contract may pass an output schema so the provider constrains its response.
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
  profile_interpret:
    "Map only details explicitly stated or explicitly requested for change onto the allowed profile fields. Return canonical field keys. Never infer, invent, or overwrite a field that was not mentioned. Keep country distinct from location, phone distinct from country calling code, and education distinct from major. Omit every field with no explicit value.",
  compare_versions:
    "Summarize what changed between two document versions. State assumptions explicitly and flag anything uncertain.",
  summarize_conversation:
    "Summarize the conversation faithfully: what was discussed, decided, and left open.",
  summarize_decisions:
    "Extract the decisions made in the conversation, who made them, and what is still pending.",
  extract_action_items:
    "Extract concrete action items with owners and due hints. Skip vague statements that commit to nothing.",
  project_summarize: "Summarize the supplied project document faithfully. Return a concise summary, key points, assumptions, and questions grounded only in supplied files.",
  project_missing_info: "Identify missing information needed to make the supplied project document complete. Return concrete gaps, why each matters, and questions; do not invent answers.",
  project_improve: "Improve grammar and clarity while preserving meaning and facts. Return editable document nodes and a brief note describing the edit.",
  project_rewrite_selection: "Rewrite only the supplied selected text for clarity while preserving its meaning. Return editable document nodes and flag uncertainty.",
  project_generate_section: "Draft the requested project-document section using only supplied context. Clearly label assumptions and return editable document nodes.",
  project_proposal: "Draft a project proposal grounded in supplied context. Flag assumptions, missing evidence, and follow-up questions; return editable document nodes.",
  project_budget: "Prepare a draft budget structure from supplied evidence. Never invent prices or funding; mark unknown amounts and return editable document nodes.",
  project_research: "Organize supplied research notes and sources. Do not claim to browse or add facts not present; flag verification needs.",
  project_loan_request: "Prepare a loan request draft from project context. Do not invent amounts, terms, or provider commitments; return editable nodes and gaps.",
  project_support_request: "Prepare a support request draft from project context. Do not invent needs or commitments; return editable nodes and gaps.",
  project_analyze_responses: "Compare supplied provider responses against the request. Keep each provider's statements attributed and identify unanswered items.",
  project_ask: "Answer the question using only supplied project files. Cite which supplied file supports each point and state when the answer is unavailable.",
  call_interpret:
    "Interpret this call dialogue collectively: key points, decisions, action items with owners, and open questions. Ground every point in the supplied turns, attribute statements to their speaker labels (C1, C2, …), and flag anything uncertain. Never invent content that was not said.",
};

/** Shared task instructions — also reused by the open-weights transport. */
export function instructionFor(task: string): string | null {
  return TASK_INSTRUCTIONS[task] ?? null;
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
  outputSchema?: Record<string, unknown>;
}): Promise<SparkTaskResult> {
  const url = sparkChatEndpoint();
  const key = process.env.MUSE_SPARK_API_KEY;
  const model = sparkModel();
  if (!url || !key) {
    return { model, error: "Muse Spark is not configured" };
  }
  const taskInstruction = instructionFor(request.task);
  if (!taskInstruction) {
    return { model, error: "This assistant task is not registered. Choose a supported task and retry." };
  }
  const system =
    `${taskInstruction} Respond with a single JSON object and nothing else.` +
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
        response_format: request.outputSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: `${request.task.replace(/[^a-z0-9_-]/gi, "_")}_result`,
                strict: false,
                schema: request.outputSchema,
              },
            }
          : { type: "json_object" },
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
