import { z } from "zod";
import { validateFieldName } from "./flexible-records";

/**
 * AI-generated form-definition contract (correction §3).
 *
 * A form definition is DATA, never executable code or an authorization
 * policy. Muse Spark may propose fields; the server validates the proposal
 * against this contract before rendering, and enforces authorization,
 * validation, and security itself.
 */

export const FORM_FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "boolean",
  "date",
  "enum",
  "file",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Plain-text check: reject anything that looks like markup. */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[<>]/.test(v), "Markup is not allowed here.");

const constraintsSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    minLength: z.number().int().min(0).max(20000).optional(),
    maxLength: z.number().int().min(1).max(20000).optional(),
  })
  .strict()
  .refine((c) => c.min === undefined || c.max === undefined || c.min <= c.max, {
    message: "min must not exceed max.",
  })
  .refine(
    (c) => c.minLength === undefined || c.maxLength === undefined || c.minLength <= c.maxLength,
    { message: "minLength must not exceed maxLength." },
  );

const fieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine((k) => validateFieldName(k) === null, "Invalid field key."),
    label: plainText(120),
    description: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !/[<>]/.test(v), "Markup is not allowed here.")
      .optional(),
    type: z.enum(FORM_FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(plainText(120)).min(2).max(50).optional(),
    default: z.unknown().optional(),
    constraints: constraintsSchema.optional(),
  })
  .strict()
  .refine(
    (f) => (f.type === "enum" ? f.options !== undefined : f.options === undefined),
    "Enum fields need options; other types must not have options.",
  )
  .refine((f) => (f.type === "file" ? f.required !== true : true), {
    message: "File fields cannot be forced as required by AI proposals.",
  });

export const formDefinitionSchema = z
  .object({ fields: z.array(fieldSchema).min(1).max(50) })
  .strict()
  .refine((d) => new Set(d.fields.map((f) => f.key)).size === d.fields.length, {
    message: "Field keys must be unique.",
  });

export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormFieldDef = FormDefinition["fields"][number];

export type DefinitionResult =
  | { ok: true; definition: FormDefinition }
  | { ok: false; error: string };

/** Validate an AI-proposed (or user-supplied) form definition. */
export function validateFormDefinition(input: unknown): DefinitionResult {
  const parsed = formDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Invalid form definition: ${first.message}` };
  }
  // Defaults must satisfy the same constraints as submitted values.
  for (const field of parsed.data.fields) {
    if (field.default !== undefined) {
      const check = coerceValue(field, field.default);
      if (check.error) return { ok: false, error: `Invalid default for "${field.key}".` };
    }
  }
  return { ok: true, definition: parsed.data };
}

function coerceValue(
  field: FormFieldDef,
  raw: unknown,
): { value?: unknown; error?: string } {
  const empty = raw === undefined || raw === null || raw === "";
  if (empty) {
    if (field.required) return { error: "This field is required." };
    return { value: undefined };
  }
  switch (field.type) {
    case "text":
    case "longtext": {
      if (typeof raw !== "string") return { error: "Enter text." };
      const max = field.type === "text" ? 2000 : 20000;
      const v = raw.trim();
      const minLength = field.constraints?.minLength ?? 0;
      const maxLength = Math.min(field.constraints?.maxLength ?? max, max);
      if (v.length < minLength) return { error: `Enter at least ${minLength} characters.` };
      if (v.length > maxLength) return { error: `Keep this under ${maxLength} characters.` };
      return { value: v };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { error: "Enter a number." };
      if (field.constraints?.min !== undefined && n < field.constraints.min) {
        return { error: `Enter ${field.constraints.min} or more.` };
      }
      if (field.constraints?.max !== undefined && n > field.constraints.max) {
        return { error: `Enter ${field.constraints.max} or less.` };
      }
      return { value: n };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true") return { value: true };
      if (raw === "false") return { value: false };
      return { error: "Choose yes or no." };
    }
    case "date": {
      if (typeof raw !== "string") return { error: "Enter a date." };
      const t = Date.parse(raw);
      if (Number.isNaN(t)) return { error: "Enter a valid date." };
      return { value: new Date(t).toISOString() };
    }
    case "enum": {
      if (typeof raw !== "string" || !field.options?.includes(raw)) {
        return { error: "Choose one of the listed options." };
      }
      return { value: raw };
    }
    case "file": {
      // Files arrive as validated upload references, never raw content.
      if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
        return { error: "Upload a file first." };
      }
      return { value: raw };
    }
  }
}

export type SubmissionResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Validate user-submitted values against a validated definition.
 * Unknown keys are ignored here — intentional custom fields travel
 * through the flexible-records update path instead.
 */
export function validateSubmission(
  definition: FormDefinition,
  values: Record<string, unknown>,
): SubmissionResult {
  const out: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  for (const field of definition.fields) {
    const raw = values[field.key] ?? field.default;
    const coerced = coerceValue(field, raw);
    if (coerced.error) {
      fieldErrors[field.key] = coerced.error;
    } else if (coerced.value !== undefined) {
      out[field.key] = coerced.value;
    }
  }
  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, values: out };
}
