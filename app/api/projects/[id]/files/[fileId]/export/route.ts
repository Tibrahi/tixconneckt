import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import { jsPDF } from "jspdf";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectFiles, projectFolders } from "@/db/schema";
import { apiError } from "@/lib/api-response";
import { canViewFile, loadProjectWithAccess } from "@/lib/project-access";
import { docToMarkdown, tablesToCsv, tiptapToText } from "@/lib/project-docs";
import { getSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

interface InlineNode {
  text?: unknown;
  marks?: Array<{ type?: string }>;
  content?: InlineNode[];
}

function inlineRuns(node: InlineNode): TextRun[] {
  if (typeof node.text === "string") {
    const marks = node.marks ?? [];
    return [
      new TextRun({
        text: node.text,
        bold: marks.some((m) => m.type === "bold" || m.type === "strong"),
        italics: marks.some((m) => m.type === "italic" || m.type === "em"),
        underline: marks.some((m) => m.type === "underline") ? {} : undefined,
      }),
    ];
  }
  return (node.content ?? []).flatMap(inlineRuns);
}

function inlineText(node: InlineNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(inlineText).join("");
}

/** Best-effort structured conversion: headings, lists, tables, code. */
function tiptapToDocxChildren(doc: unknown): Array<Paragraph | Table> {
  const root = doc as { content?: Array<{ type?: string; attrs?: { level?: number }; content?: InlineNode[] }> };
  if (!root || !Array.isArray(root.content)) return [new Paragraph("Untitled document")];
  const out: Array<Paragraph | Table> = [];
  for (const node of root.content) {
    if (node.type === "heading") {
      const level = Math.min(6, Math.max(1, node.attrs?.level ?? 1));
      const headings = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ];
      out.push(new Paragraph({ heading: headings[level - 1], children: (node.content ?? []).flatMap(inlineRuns) }));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const item of node.content ?? []) {
        const first = item.content?.[0];
        out.push(
          new Paragraph({
            children: first ? inlineRuns(first) : [],
            bullet: node.type === "bulletList" ? { level: 0 } : undefined,
            numbering: node.type === "orderedList" ? { reference: "default-numbering", level: 0 } : undefined,
          }),
        );
      }
    } else if (node.type === "table") {
      const rows = (node.content ?? [])
        .filter((r) => (r as { type?: string }).type === "tableRow")
        .map(
          (r) =>
            new TableRow({
              children: ((r as { content?: InlineNode[] }).content ?? []).map(
                (c) => new TableCell({ children: [new Paragraph(inlineText(c))] }),
              ),
            }),
        );
      if (rows.length > 0) out.push(new Table({ rows }));
    } else if (node.type === "codeBlock") {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: (node.content ?? []).map(inlineText).join(""), font: "Consolas" })],
          shading: { fill: "F3F4F6" },
        }),
      );
    } else if (node.type === "blockquote") {
      out.push(
        new Paragraph({
          children: (node.content ?? []).flatMap(inlineRuns),
          indent: { left: 720 },
        }),
      );
    } else {
      const runs = (node.content ?? []).flatMap(inlineRuns);
      if (runs.length > 0) out.push(new Paragraph({ children: runs }));
    }
  }
  return out.length > 0 ? out : [new Paragraph("Untitled document")];
}

function safeFilename(title: string, ext: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "document"}.${ext}`;
}

interface PdfBlock {
  text: string;
  size: number;
  bold: boolean;
  indent: number;
  gapAfter: number;
}

function tiptapToPdfBlocks(doc: unknown): PdfBlock[] {
  const root = doc as { content?: Array<{ type?: string; attrs?: { level?: number }; content?: Array<{ text?: unknown; content?: Array<{ text?: unknown }> }> }> };
  if (!root || !Array.isArray(root.content)) return [{ text: "Untitled document", size: 16, bold: true, indent: 0, gapAfter: 6 }];
  const blocks: PdfBlock[] = [];
  const inline = (nodes: Array<{ text?: unknown; content?: Array<{ text?: unknown }> }> | undefined): string =>
    (nodes ?? [])
      .map((n) => (typeof n.text === "string" ? n.text : inline(n.content)))
      .join("");
  for (const node of root.content) {
    if (node.type === "heading") {
      const level = Math.min(6, Math.max(1, node.attrs?.level ?? 1));
      blocks.push({ text: inline(node.content), size: 20 - level * 2, bold: true, indent: 0, gapAfter: 5 });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      let n = 1;
      for (const item of node.content ?? []) {
        const first = (item as { content?: Array<{ text?: unknown; content?: Array<{ text?: unknown }> }> }).content?.[0];
        const prefix = node.type === "bulletList" ? "• " : `${n}. `;
        blocks.push({ text: prefix + (first ? inline([first]) : ""), size: 11, bold: false, indent: 10, gapAfter: 2 });
        n += 1;
      }
    } else if (node.type === "table") {
      for (const row of node.content ?? []) {
        const cells = ((row as { content?: Array<{ content?: Array<{ text?: unknown; content?: Array<{ text?: unknown }> }> }> }).content ?? []).map((c) =>
          (c.content ?? []).map((p) => inline([p])).join(" "),
        );
        blocks.push({ text: cells.join("  |  "), size: 10, bold: false, indent: 5, gapAfter: 1 });
      }
      blocks.push({ text: "", size: 11, bold: false, indent: 0, gapAfter: 4 });
    } else if (node.type === "codeBlock") {
      blocks.push({ text: inline(node.content), size: 9, bold: false, indent: 5, gapAfter: 4 });
    } else if (node.type === "horizontalRule") {
      blocks.push({ text: "─".repeat(60), size: 10, bold: false, indent: 0, gapAfter: 4 });
    } else {
      const text = inline(node.content);
      if (text.trim()) blocks.push({ text, size: 11, bold: false, indent: 0, gapAfter: 4 });
    }
  }
  return blocks.length > 0 ? blocks : [{ text: "Untitled document", size: 16, bold: true, indent: 0, gapAfter: 6 }];
}

function tiptapToPdf(doc: unknown, title: string): Buffer {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const maxWidth = 595 - margin * 2;
  let y = margin;
  const ensure = (needed: number) => {
    if (y + needed > 842 - margin) {
      pdf.addPage();
      y = margin;
    }
  };
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  for (const line of pdf.splitTextToSize(title, maxWidth) as string[]) {
    ensure(24);
    pdf.text(line, margin, y);
    y += 24;
  }
  y += 8;
  for (const block of tiptapToPdfBlocks(doc)) {
    if (!block.text.trim()) {
      y += block.gapAfter;
      continue;
    }
    pdf.setFont("helvetica", block.bold ? "bold" : "normal");
    pdf.setFontSize(block.size);
    const lines = pdf.splitTextToSize(block.text, maxWidth - block.indent) as string[];
    for (const line of lines) {
      ensure(block.size + 4);
      pdf.text(line, margin + block.indent, y);
      y += block.size + 4;
    }
    y += block.gapAfter;
  }
  return Buffer.from(pdf.output("arraybuffer"));
}

/**
 * Real document export (Project.md §5/§7/§8): Markdown, plain text, CSV
 * (first table), PDF, or Word (.docx) — all generated server-side from
 * the structured content. Viewers may export exactly what they may open.
 */
export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const { id, fileId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  const db = getDb();
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, id)))
    .limit(1);
  if (!file) return apiError("Document not found.", 404);

  const folders = await db
    .select({ id: projectFolders.id, parentFolderId: projectFolders.parentFolderId })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, id))
    .limit(500);
  const map = new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
  if (!canViewFile(loaded.access, file, map, session.user.id)) {
    return apiError("This document is not shared with you.", 403);
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "md";
  if (format === "md") {
    return new Response(docToMarkdown(file.contentJson), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(file.title, "md")}"`,
      },
    });
  }
  if (format === "txt") {
    return new Response(tiptapToText(file.contentJson), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(file.title, "txt")}"`,
      },
    });
  }
  if (format === "csv") {
    const tables = tablesToCsv(file.contentJson);
    if (tables.length === 0) return apiError("This document has no tables to export.", 404);
    return new Response(tables[0], {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(file.title, "csv")}"`,
      },
    });
  }
  if (format === "pdf") {
    const buffer = tiptapToPdf(file.contentJson, file.title);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(file.title, "pdf")}"`,
      },
    });
  }
  if (format === "docx") {
    const doc = new Document({
      numbering: {
        config: [
          {
            reference: "default-numbering",
            levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }],
          },
        ],
      },
      sections: [{ children: tiptapToDocxChildren(file.contentJson) }],
    });
    const buffer = await Packer.toBuffer(doc);
    const body = new Uint8Array(buffer);
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename(file.title, "docx")}"`,
      },
    });
  }
  return apiError("Unsupported export format. Use md, txt, csv, pdf, or docx.", 400);
}
