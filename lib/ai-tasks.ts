import type { FormFieldDef } from "./ai-form-definition";

/**
 * Dynamic Muse task definitions (correction §3, §4).
 *
 * Required inputs are determined per task from the actual context — the
 * user's goal plus data already available from profile, project, uploaded
 * files, or previous interactions. Nothing here hardcodes a permanent form:
 * when sufficient information is already present, no questions are asked.
 *
 * Muse Spark may propose output structure, but the server validates every
 * result before persisting it to JSONB.
 */

export type AiEngine = "spark" | "voice";

export interface AiTaskDef {
  id: string;
  engine: AiEngine;
  label: string;
  description: string;
  /** Keys the task genuinely needs; missing ones become questions. */
  needs: string[];
  /** Human-readable question per needed key. */
  questions: Record<string, { label: string; description?: string; long?: boolean }>;
  /** Whether the configured service can run this task today. */
  supported: boolean;
  unsupportedReason?: string;
}

export const AI_TASKS: AiTaskDef[] = [
  {
    id: "project_analysis",
    engine: "spark",
    label: "Project analysis",
    description: "Structure an idea into a reviewable project document.",
    needs: ["goal", "context"],
    questions: {
      goal: { label: "What should the analysis focus on?", long: true },
      context: {
        label: "What should the analysis consider?",
        description: "Constraints, audience, timeline — anything relevant.",
        long: true,
      },
    },
    supported: true,
  },
  {
    id: "match_explain",
    engine: "spark",
    label: "Match explanation",
    description: "Explain why two profiles are compatible collaborators.",
    needs: ["profileA", "profileB"],
    questions: {
      profileA: { label: "Describe the first profile.", long: true },
      profileB: { label: "Describe the second profile.", long: true },
    },
    supported: true,
  },
  {
    id: "parse_document",
    engine: "spark",
    label: "Document extraction",
    description: "Extract the information actually present in a document.",
    needs: ["goal"],
    questions: {
      goal: {
        label: "What do you want from this document?",
        description: "For example: transaction details, contact info, or a summary.",
        long: true,
      },
    },
    supported: true,
  },
  {
    id: "interpret_action",
    engine: "spark",
    label: "Action interpretation",
    description: "Turn an instruction into a reviewable scheduled action.",
    needs: ["instruction"],
    questions: {
      instruction: { label: "What should happen, and when?", long: true },
    },
    supported: true,
  },
  {
    id: "profile_suggest",
    engine: "spark",
    label: "Profile suggestions",
    description: "Suggest profile field values from context you provide.",
    needs: ["context"],
    questions: {
      context: {
        label: "What should the suggestions be based on?",
        description: "Paste background, a bio, or notes. You review everything before saving.",
        long: true,
      },
    },
    supported: true,
  },
  {
    id: "summarize_conversation",
    engine: "spark",
    label: "Conversation summary",
    description: "Summarize recent messages in a conversation you belong to.",
    needs: ["goal"],
    questions: {
      goal: {
        label: "What should the summary focus on?",
        description: "Optional — leave blank for a general summary.",
        long: true,
      },
    },
    supported: true,
  },
  {
    id: "summarize_decisions",
    engine: "spark",
    label: "Decision summary",
    description: "Organize group decisions from recent conversation messages.",
    needs: ["goal"],
    questions: {
      goal: {
        label: "Which decisions matter here?",
        description: "Optional — leave blank to capture all apparent decisions.",
        long: true,
      },
    },
    supported: true,
  },
  {
    id: "extract_action_items",
    engine: "spark",
    label: "Action items",
    description: "Extract action items from recent conversation messages.",
    needs: ["goal"],
    questions: {
      goal: {
        label: "What kind of follow-ups should it look for?",
        description: "Optional — leave blank for general action items.",
        long: true,
      },
    },
    supported: true,
  },
  {
    id: "transcribe",
    engine: "voice",
    label: "Voice transcription",
    description: "Convert spoken audio into text.",
    needs: ["audio"],
    questions: {},
    supported: true,
  },
  {
    id: "summarize_audio",
    engine: "voice",
    label: "Audio summarization",
    description: "Summarize spoken audio directly.",
    needs: ["audio"],
    questions: {},
    supported: false,
    unsupportedReason: "The configured voice service exposes transcription only.",
  },
  {
    id: "extract_audio",
    engine: "voice",
    label: "Structured audio extraction",
    description: "Extract structured fields directly from audio.",
    needs: ["audio"],
    questions: {},
    supported: false,
    unsupportedReason: "The configured voice service exposes transcription only.",
  },
];

export function getAiTask(taskId: string): AiTaskDef | null {
  return AI_TASKS.find((t) => t.id === taskId) ?? null;
}

export interface TaskContext {
  /** Data already available: profile/project fields, file refs, transcripts. */
  available: Record<string, unknown>;
}

export interface DeterminedInputs {
  taskId: string;
  /** Questions genuinely needed — empty when context already suffices. */
  fields: FormFieldDef[];
  /** Available values carried into the request (never re-asked). */
  prefill: Record<string, unknown>;
  canProceedWithoutQuestions: boolean;
}

function hasUsableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Determine which inputs a task still needs given the available context.
 * Present values are carried as prefill; only missing keys become fields.
 */
export function determineTaskInputs(task: AiTaskDef, context: TaskContext): DeterminedInputs {
  const fields: FormFieldDef[] = [];
  const prefill: Record<string, unknown> = {};
  for (const key of task.needs) {
    const value = context.available[key];
    if (hasUsableValue(value)) {
      prefill[key] = value;
      continue;
    }
    if (key === "audio") continue; // Audio uses capture/upload controls, not a question.
    const question = task.questions[key] ?? { label: `Provide ${key}.` };
    fields.push({
      key,
      label: question.label,
      description: question.description,
      type: question.long ? "longtext" : "text",
      required: true,
    });
  }
  return {
    taskId: task.id,
    fields,
    prefill,
    canProceedWithoutQuestions: fields.length === 0,
  };
}
