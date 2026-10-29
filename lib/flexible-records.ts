/**
 * JSON-first flexible document helpers (correction §2, §7).
 *
 * Flexible attributes live inside a JSONB document. These pure helpers:
 * - validate dynamic field names, types, sizes, and depth;
 * - deep-merge intentional changes while preserving unknown fields;
 * - never mutate the input document.
 *
 * Relational columns stay in charge of identity, ownership, visibility,
 * and querying; this module only governs the flexible JSON payload.
 */

export const MAX_FIELDS = 200;
export const MAX_DOC_BYTES = 500 * 1024;
export const MAX_STRING = 20000;
export const MAX_ARRAY = 200;
export const MAX_DEPTH = 6;

const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Validate a single dynamic field-name segment. Returns an error or null. */
export function validateFieldName(name: string): string | null {
  if (typeof name !== "string" || name.length === 0) return "Field name is required.";
  if (FORBIDDEN_KEYS.has(name)) return "Field name is reserved.";
  if (!FIELD_NAME_RE.test(name)) {
    return "Use 1-64 chars: start with a letter, then letters, digits, or underscores.";
  }
  return null;
}

/** Validate a dotted path such as `customFields.preferredFramework`. */
export function validateFieldPath(path: string): string | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 256) {
    return "Field path is invalid.";
  }
  const segments = path.split(".");
  if (segments.length > MAX_DEPTH) return "Field path is nested too deeply.";
  for (const segment of segments) {
    const problem = validateFieldName(segment);
    if (problem) return problem;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate a dynamic value: text, numbers, booleans, null, dates (ISO
 * strings), enums (strings), file references (strings), arrays, and nested
 * objects. `depth` is the current nesting level (callers pass 0).
 */
export function validateFieldValue(value: unknown, depth: number): string | null {
  if (value === null) return null;
  if (typeof value === "string") {
    if (value.length > MAX_STRING) return `Text exceeds ${MAX_STRING} characters.`;
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "Number must be finite.";
    return null;
  }
  if (typeof value === "boolean") return null;
  if (depth >= MAX_DEPTH) return "Value is nested too deeply.";
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) return `Arrays are limited to ${MAX_ARRAY} items.`;
    for (const item of value) {
      const problem = validateFieldValue(item, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > MAX_FIELDS) return `Objects are limited to ${MAX_FIELDS} fields.`;
    for (const key of keys) {
      const nameProblem = validateFieldName(key);
      if (nameProblem) return `Invalid field "${key}": ${nameProblem}`;
      const problem = validateFieldValue(value[key], depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  return "Unsupported value type.";
}

function countFields(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((n, item) => n + countFields(item), 0);
  if (isPlainObject(value)) {
    return Object.keys(value).reduce<number>((n, key) => n + 1 + countFields(value[key]), 0);
  }
  return 0;
}

/** Enforce whole-document field and byte budgets. */
export function validateDocSize(doc: Record<string, unknown>): string | null {
  if (countFields(doc) > MAX_FIELDS) return `Documents are limited to ${MAX_FIELDS} fields.`;
  let bytes = 0;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
  } catch {
    return "Document is not valid JSON.";
  }
  if (bytes > MAX_DOC_BYTES) return "Document exceeds the 500 KB limit.";
  return null;
}

function clone<T>(value: T): T {
  // structuredClone is available in Node 18+ and modern browsers.
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

function setPath(target: Record<string, unknown>, segments: string[], value: unknown): void {
  let node = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = node[key];
    if (isPlainObject(existing)) {
      node[key] = { ...existing };
    } else if (existing === undefined) {
      node[key] = {};
    } else {
      // Replacing a scalar/array with an object is an intentional overwrite
      // of that path only; sibling fields are untouched.
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  const leaf = segments[segments.length - 1];
  const current = node[leaf];
  if (isPlainObject(current) && isPlainObject(value)) {
    node[leaf] = deepMergeObjects(current, value);
  } else {
    node[leaf] = clone(value);
  }
}

function deepMergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = deepMergeObjects(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = clone(value);
    }
  }
  return out;
}

function removePath(target: Record<string, unknown>, segments: string[]): void {
  let node: unknown = target;
  for (let i = 0; i < segments.length - 1; i++) {
    if (!isPlainObject(node)) return;
    const next = (node as Record<string, unknown>)[segments[i]];
    if (!isPlainObject(next)) return;
    (node as Record<string, unknown>)[segments[i]] = { ...next };
    node = (node as Record<string, unknown>)[segments[i]];
  }
  if (isPlainObject(node)) {
    delete (node as Record<string, unknown>)[segments[segments.length - 1]];
  }
}

export interface DocUpdate {
  /** Dotted paths to set/merge, e.g. `{ "customFields.x": 1 }`. */
  set: Record<string, unknown>;
  /** Dotted paths to remove. */
  remove: string[];
}

/**
 * Apply an intentional update to a copy of `doc`. Unknown sibling fields
 * are always preserved; only paths in `set`/`remove` change. Callers must
 * validate names, values, and size before calling this.
 */
export function applyDocUpdate(
  doc: Record<string, unknown>,
  update: DocUpdate,
): Record<string, unknown> {
  const next = clone(doc);
  for (const [path, value] of Object.entries(update.set)) {
    setPath(next, path.split("."), value);
  }
  for (const path of update.remove) {
    removePath(next, path.split("."));
  }
  return next;
}
