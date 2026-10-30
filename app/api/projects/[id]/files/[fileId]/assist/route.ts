import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projectFiles, projectFileVersions, projectFolders } from "@/db/schema";
import { callMuseSpark, validateSparkJson } from "@/lib/ai";
import { aiSparkConfigured } from "@/lib/config";
import { apiError, apiOk } from "@/lib/api-response";
import { canViewFile, loadProjectWithAccess, logActivity } from "@/lib/project-access";
import { diffWords, tiptapToText, validateAiNodes } from "@/lib/project-docs";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { projectAssistSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

const NODE_TASKS = new Set([
  "improve",
  "rewrite_selection",
  "generate_section",
  "proposal",
  "budget",
  "loan_request",
  "support_request",
]);

const TASK_HINTS: Record<string, string> = {
  summarize: "{ summary: string, keyPoints: string[] }",
  missing_info: "{ gaps: [{ area: string, question: string }], assumptions: string[] }",
  improve: '{ nodes: [Tiptap paragraph|heading|bulletList|orderedList|blockquote|codeBlock nodes], note: string }. Text-only content; marks limited to bold/italic/link.',
  rewrite_selection: '{ nodes: [Tiptap nodes], note: string }',
  generate_section: '{ nodes: [Tiptap nodes], note: string }',
  proposal: '{ nodes: [Tiptap nodes], note: string }',
  budget: '{ nodes: [Tiptap nodes including at most one simple table], note: string }',
  research: "{ findings: [{ point: string, sourceHint?: string }], questions: string[], assumptions: string[] }",
  loan_request: '{ nodes: [Tiptap nodes], note: string, checklist: string[] }',
  support_request: '{ nodes: [Tiptap nodes], note: string, checklist: string[] }',
  analyze_responses: "{ themes: string[], comparison: string, recommendation: string, assumptions: string[] }",
  compare_versions: "{ summary: string }",
  ask: "{ answer: string, assumptions: string[] }",
};

/**
 * Document assistant (Project.md §6): builds authorized context from the
 * active file (and explicitly chosen files the user may open), calls Muse
 * Spark, and returns a REVIEWABLE proposal. Nothing here writes to the
 * document — applying is a deliberate client save with AI metadata.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) return apiError("Sign in required.", 401);
  const rl = await rateLimit("project-assist", session.user.id, 20, "10 m");
  if (!rl.allowed) return apiError("Too many AI requests. Please try again shortly.", 429);
  if (!aiSparkConfigured()) {
    return apiError("Muse Spark is not configured, so the assistant is unavailable.", 503);
  }

  const { id, fileId } = await params;
  const loaded = await loadProjectWithAccess(id, session.user.id, session.user.role);
  if (!loaded.ok) return apiError(loaded.error, loaded.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body.");
  }
  const parsed = projectAssistSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid assistant request.", 400);
  const input = parsed.data;

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

  // compare_versions is computed locally (exact diff) + an AI summary.
  if (input.task === "compare_versions") {
    if (!input.versionA || !input.versionB) {
      return apiError("Choose two versions to compare.", 400);
    }
    const versions = await db
      .select()
      .from(projectFileVersions)
      .where(eq(projectFileVersions.fileId, fileId))
      .limit(100);
    const a = versions.find((v) => v.versionNumber === input.versionA);
    const b = versions.find((v) => v.versionNumber === input.versionB);
    if (!a || !b) return apiError("One of the versions no longer exists.", 404);
    const textA = tiptapToText(a.contentJson, 30000);
    const textB = tiptapToText(b.contentJson, 30000);
    const diff = diffWords(textA, textB);
    const spark = await callMuseSpark({
      task: "compare_versions",
      input: {
        instructions:
          "Summarize what changed between two document versions. State assumptions explicitly and flag anything uncertain.",
        before: textA.slice(0, 15000),
        after: textB.slice(0, 15000),
      },
      schemaHint: TASK_HINTS.compare_versions,
    });
    let summary: string | null = null;
    if (spark.data && !spark.error) {
      const checked = validateSparkJson(spark.data);
      if (checked.ok && typeof checked.doc.summary === "string") summary = checked.doc.summary;
    }
    await logActivity(id, session.user.id, "ai.proposed", "file", fileId, {
      task: "compare_versions",
      versionA: input.versionA,
      versionB: input.versionB,
    });
    return apiOk({ kind: "diff", diff, summary });
  }

  // Assemble authorized context.
  const contextFiles: Array<{ title: string; text: string }> = [
    { title: file.title, text: tiptapToText(file.contentJson, 30000) },
  ];
  if (input.fileIds && input.fileIds.length > 0) {
    const extra = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, id))
      .limit(200);
    for (const fid of input.fileIds.slice(0, 5)) {
      if (fid === fileId) continue;
      const other = extra.find((f) => f.id === fid);
      if (!other) continue;
      // Providers only ever contribute files they may open.
      if (!canViewFile(loaded.access, other, map, session.user.id)) continue;
      contextFiles.push({ title: other.title, text: tiptapToText(other.contentJson, 10000) });
    }
  }

  if (input.task === "rewrite_selection" && !input.selection?.trim()) {
    return apiError("Select the text to rewrite first.", 400);
  }
  if (input.task === "ask" && !input.question?.trim()) {
    return apiError("Ask a question first.", 400);
  }

  const spark = await callMuseSpark({
    task: `project_${input.task}`,
    input: {
      instructions:
        "You assist with a project document. Identify every assumption you make, flag uncertain claims, and list follow-up questions where the request needs more information. Never invent facts about people, organizations, or finances.",
      project: { title: loaded.project.title, summary: loaded.project.summary.slice(0, 2000) },
      document: { title: file.title, type: file.documentType },
      files: contextFiles,
      selection: input.selection?.slice(0, 20000) ?? "",
      request: input.instruction ?? input.question ?? "",
    },
    schemaHint: TASK_HINTS[input.task],
  });
  if (spark.error || !spark.data) {
    return apiError(spark.error ?? "The assistant failed. You can retry safely.", 502);
  }
  const validated = validateSparkJson(spark.data);
  if (!validated.ok) return apiError("The assistant returned an unusable result.", 502);
  const doc = validated.doc;

  if (NODE_TASKS.has(input.task)) {
    const nodes = doc.nodes;
    const nodeProblem = validateAiNodes(nodes);
    if (nodeProblem) return apiError(`The assistant returned unusable content (${nodeProblem}). Retry or rephrase.`, 502);
    await logActivity(id, session.user.id, "ai.proposed", "file", fileId, { task: input.task });
    return apiOk({
      kind: "nodes",
      nodes,
      note: typeof doc.note === "string" ? doc.note : "",
      checklist: Array.isArray(doc.checklist) ? doc.checklist : undefined,
    });
  }

  await logActivity(id, session.user.id, "ai.proposed", "file", fileId, { task: input.task });
  return apiOk({ kind: "report", report: doc });
}
