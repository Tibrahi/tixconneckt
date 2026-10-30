/**
 * Pure document helpers for the project playground (Project.md §5/§7).
 * The editor stores structured Tiptap JSON in contentJson — never rendered
 * HTML alone. These functions validate, extract, serialize, and diff that
 * structure without I/O, so they are unit-testable.
 */

export const MAX_DOC_JSON_BYTES = 1_000_000;
export const MAX_DOC_TEXT_CHARS = 200_000;
export const MAX_DOC_NODES = 2000;
export const MAX_DOC_DEPTH = 12;
export const TEXT_CACHE_CHARS = 20_000;

interface TiptapNode {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

/** Validate a Tiptap document shape with bounded size and depth. */
export function validateTiptapDoc(doc: unknown): string | null {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return "Document content must be a structured document.";
  }
  let json: string;
  try {
    json = JSON.stringify(doc);
  } catch {
    return "Document content is not serializable.";
  }
  if (json.length > MAX_DOC_JSON_BYTES) {
    return "Document exceeds the 1 MB size limit.";
  }
  const root = doc as TiptapNode;
  if (root.type !== "doc" || !Array.isArray(root.content)) {
    return "Document content must be a structured document.";
  }
  let nodes = 0;
  let textChars = 0;
  const walk = (node: TiptapNode, depth: number): string | null => {
    if (depth > MAX_DOC_DEPTH) return "Document is nested too deeply.";
    if (typeof node !== "object" || node === null || typeof node.type !== "string") {
      return "Document contains an invalid block.";
    }
    nodes += 1;
    if (nodes > MAX_DOC_NODES) return "Document has too many blocks.";
    if (typeof node.text === "string") {
      textChars += node.text.length;
      if (textChars > MAX_DOC_TEXT_CHARS) return "Document text exceeds the size limit.";
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return "Document contains an invalid block.";
      for (const child of node.content) {
        const problem = walk(child, depth + 1);
        if (problem) return problem;
      }
    }
    return null;
  };
  for (const child of root.content) {
    const problem = walk(child, 1);
    if (problem) return problem;
  }
  return null;
}

function nodeText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) return node.content.map(nodeText).join("");
  return "";
}

function blockTexts(node: TiptapNode, out: string[]): void {
  if (typeof node.text === "string") {
    out.push(node.text);
    return;
  }
  if (!Array.isArray(node.content)) return;
  if (node.type === "table") {
    for (const row of node.content) {
      if (row.type !== "tableRow" || !Array.isArray(row.content)) continue;
      out.push(row.content.map((cell) => nodeText(cell).trim()).join(" | "));
    }
    return;
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    for (const item of node.content) out.push(`- ${nodeText(item).trim()}`);
    return;
  }
  for (const child of node.content) blockTexts(child, out);
}

/** Plain-text extraction for search caches, previews, and AI context. */
export function tiptapToText(doc: unknown, maxChars = MAX_DOC_TEXT_CHARS): string {
  if (typeof doc !== "object" || doc === null) return "";
  const root = doc as TiptapNode;
  if (!Array.isArray(root.content)) return "";
  const out: string[] = [];
  for (const child of root.content) blockTexts(child, out);
  return out.join("\n").slice(0, maxChars);
}

export interface DocHeading {
  level: number;
  text: string;
}

/** Headings for the document outline. */
export function extractHeadings(doc: unknown): DocHeading[] {
  if (typeof doc !== "object" || doc === null) return [];
  const root = doc as TiptapNode;
  if (!Array.isArray(root.content)) return [];
  const headings: DocHeading[] = [];
  const walk = (nodes: TiptapNode[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const level = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
        const text = nodeText(node).trim();
        if (text) headings.push({ level: Math.min(6, Math.max(1, level)), text: text.slice(0, 200) });
      }
      if (Array.isArray(node.content)) walk(node.content);
    }
  };
  walk(root.content);
  return headings.slice(0, 200);
}

/** Serialize a Tiptap document to Markdown (real export, formatting kept). */
export function docToMarkdown(doc: unknown): string {
  if (typeof doc !== "object" || doc === null) return "";
  const root = doc as TiptapNode;
  if (!Array.isArray(root.content)) return "";
  const lines: string[] = [];
  const inline = (node: TiptapNode): string => {
    if (typeof node.text === "string") {
      let text = node.text;
      const marks = (node as { marks?: Array<{ type?: string; attrs?: Record<string, unknown> }> }).marks ?? [];
      for (const mark of marks) {
        if (mark.type === "bold" || mark.type === "strong") text = `**${text}**`;
        else if (mark.type === "italic" || mark.type === "em") text = `*${text}*`;
        else if (mark.type === "strike") text = `~~${text}~~`;
        else if (mark.type === "code") text = `\`${text}\``;
        else if (mark.type === "link" && typeof mark.attrs?.href === "string") text = `[${text}](${mark.attrs.href})`;
      }
      return text;
    }
    if (Array.isArray(node.content)) return node.content.map(inline).join("");
    return "";
  };
  const block = (node: TiptapNode, indent: string) => {
    switch (node.type) {
      case "heading": {
        const level = typeof node.attrs?.level === "number" ? Math.min(6, Math.max(1, node.attrs.level)) : 1;
        lines.push(`${"#".repeat(level)} ${inline(node)}`);
        break;
      }
      case "paragraph":
        lines.push(`${indent}${inline(node)}`);
        break;
      case "bulletList":
        for (const item of node.content ?? []) {
          const first = item.content?.[0];
          lines.push(`${indent}- ${first ? inline(first) : ""}`);
          for (const rest of (item.content ?? []).slice(1)) block(rest, `${indent}  `);
        }
        break;
      case "orderedList": {
        let n = 1;
        for (const item of node.content ?? []) {
          const first = item.content?.[0];
          lines.push(`${indent}${n}. ${first ? inline(first) : ""}`);
          n += 1;
          for (const rest of (item.content ?? []).slice(1)) block(rest, `${indent}   `);
        }
        break;
      }
      case "blockquote":
        lines.push(`> ${inline(node)}`);
        break;
      case "codeBlock":
        lines.push("```", nodeText(node), "```");
        break;
      case "horizontalRule":
        lines.push("---");
        break;
      case "table": {
        const rows = (node.content ?? []).filter((r) => r.type === "tableRow");
        rows.forEach((row, i) => {
          const cells = (row.content ?? []).map((c) => inline(c).replace(/\|/g, "\\|"));
          lines.push(`| ${cells.join(" | ")} |`);
          if (i === 0 && cells.length > 0) lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
        });
        break;
      }
      case "image": {
        const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
        const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "image";
        lines.push(`![${alt}](${src})`);
        break;
      }
      default:
        if (Array.isArray(node.content)) for (const child of node.content) block(child, indent);
    }
  };
  for (const child of root.content) {
    block(child, "");
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** One CSV document per table in the document (budget tables export). */
export function tablesToCsv(doc: unknown): string[] {
  if (typeof doc !== "object" || doc === null) return [];
  const root = doc as TiptapNode;
  if (!Array.isArray(root.content)) return [];
  const tables: string[][][] = [];
  const walk = (nodes: TiptapNode[]) => {
    for (const node of nodes) {
      if (node.type === "table" && Array.isArray(node.content)) {
        const rows: string[][] = [];
        for (const row of node.content) {
          if (row.type !== "tableRow" || !Array.isArray(row.content)) continue;
          rows.push(row.content.map((cell) => nodeText(cell).trim()));
        }
        if (rows.length > 0) tables.push(rows);
      }
      if (Array.isArray(node.content)) walk(node.content);
    }
  };
  walk(root.content);
  const escape = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return tables.map((rows) => rows.map((r) => r.map(escape).join(",")).join("\n"));
}

export type WordDiffOp = { type: "same" | "add" | "del"; text: string };

/**
 * Word-level diff (LCS) for version comparison and AI proposal review.
 * Falls back to whole-text replace markers beyond the word cap.
 */
export function diffWords(before: string, after: string, cap = 2000): WordDiffOp[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length > cap || b.length > cap) {
    if (before === after) return [{ type: "same", text: before }];
    return [
      { type: "del", text: before },
      { type: "add", text: after },
    ];
  }
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: WordDiffOp[] = [];
  let i = 0;
  let j = 0;
  const push = (type: WordDiffOp["type"], word: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += ` ${word}`;
    else ops.push({ type, text: word });
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i += 1;
    } else {
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < n) {
    push("del", a[i]);
    i += 1;
  }
  while (j < m) {
    push("add", b[j]);
    j += 1;
  }
  return ops;
}

const AI_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "text",
  "hardBreak",
]);

const AI_MARKS = new Set(["bold", "italic", "underline", "link", "code"]);

/**
 * Validate AI-produced nodes before they may be inserted by the client.
 * Restricted to text-only structural nodes and safe marks — no images,
 * no raw HTML, no unknown extensions.
 */
export function validateAiNodes(nodes: unknown): string | null {
  if (!Array.isArray(nodes) || nodes.length === 0) return "no content blocks";
  if (nodes.length > 200) return "too many blocks";
  let chars = 0;
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 8) return "nested too deeply";
    if (typeof node !== "object" || node === null) return "invalid block";
    const n = node as { type?: unknown; text?: unknown; content?: unknown; marks?: unknown };
    if (typeof n.type !== "string" || !AI_NODE_TYPES.has(n.type)) {
      return `unsupported block "${String(n.type)}"`;
    }
    if (typeof n.text === "string") {
      chars += n.text.length;
      if (chars > 100_000) return "content too long";
    }
    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks)) return "invalid formatting";
      for (const mark of n.marks) {
        if (typeof mark !== "object" || mark === null) return "invalid formatting";
        const type = (mark as { type?: unknown }).type;
        if (typeof type !== "string" || !AI_MARKS.has(type)) return `unsupported formatting "${String(type)}"`;
        if (type === "link") {
          const href = (mark as { attrs?: { href?: unknown } }).attrs?.href;
          if (typeof href !== "string" || !/^https?:\/\//.test(href)) return "unsafe link";
        }
      }
    }
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) return "invalid block";
      for (const child of n.content) {
        const problem = walk(child, depth + 1);
        if (problem) return problem;
      }
    }
    return null;
  };
  for (const node of nodes) {
    const problem = walk(node, 1);
    if (problem) return problem;
  }
  return null;
}
