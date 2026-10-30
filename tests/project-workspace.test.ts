import { describe, expect, it } from "vitest";
import {
  canEditFile,
  canViewFile,
  folderChain,
  responseMetaOf,
  type ProjectAccess,
} from "@/lib/project-access";
import {
  diffWords,
  docToMarkdown,
  tablesToCsv,
  tiptapToText,
  validateAiNodes,
  validateTiptapDoc,
} from "@/lib/project-docs";
import {
  organizationSchema,
  projectAssistSchema,
  providerResponseSchema,
  verificationDecisionSchema,
  verificationSubmitSchema,
} from "@/lib/validation";

const doc = (content: unknown[]) => ({ type: "doc", content });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("validateTiptapDoc", () => {
  it("accepts a well-formed document", () => {
    expect(validateTiptapDoc(doc([para("Hello")]))).toBeNull();
  });

  it("rejects non-documents", () => {
    expect(validateTiptapDoc(null)).toContain("structured");
    expect(validateTiptapDoc([])).toContain("structured");
    expect(validateTiptapDoc({ type: "paragraph", content: [] })).toContain("structured");
  });

  it("rejects oversize documents", () => {
    expect(validateTiptapDoc(doc([para("x".repeat(300_000))]))).toMatch(/size limit|1 MB/);
  });

  it("rejects invalid blocks", () => {
    expect(validateTiptapDoc(doc([{ type: 42 }]))).toContain("invalid block");
  });
});

describe("tiptapToText / docToMarkdown / tablesToCsv", () => {
  const rich = doc([
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Budget" }] },
    para("Total costs"),
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [para("Seeds")] },
        { type: "listItem", content: [para("Tools")] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [para("Item")] },
            { type: "tableHeader", content: [para("Cost")] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [para("Seeds")] },
            { type: "tableCell", content: [para("50000")] },
          ],
        },
      ],
    },
  ]);

  it("extracts plain text with block separation", () => {
    const text = tiptapToText(rich);
    expect(text).toContain("Budget");
    expect(text).toContain("Seeds");
    expect(text).toContain("50000");
  });

  it("converts headings, lists, and tables to markdown", () => {
    const md = docToMarkdown(rich);
    expect(md).toContain("## Budget");
    expect(md).toContain("- Seeds");
    expect(md).toContain("| Item | Cost |");
    expect(md).toContain("| --- | --- |");
  });

  it("exports tables to CSV", () => {
    const csv = tablesToCsv(rich);
    expect(csv).toHaveLength(1);
    expect(csv[0]).toContain("Item,Cost");
    expect(csv[0]).toContain("Seeds,50000");
  });

  it("returns empty results for non-documents", () => {
    expect(tiptapToText(null)).toBe("");
    expect(docToMarkdown(null)).toBe("");
    expect(tablesToCsv(doc([para("no tables")]))).toEqual([]);
  });
});

describe("diffWords", () => {
  it("marks unchanged text as same", () => {
    expect(diffWords("hello world", "hello world")).toEqual([{ type: "same", text: "hello world" }]);
  });

  it("detects additions and deletions", () => {
    const ops = diffWords("the quick fox", "the quick brown fox");
    expect(ops).toContainEqual({ type: "add", text: "brown" });
    expect(ops.some((o) => o.type === "same")).toBe(true);
    const del = diffWords("a b c", "a c");
    expect(del).toContainEqual({ type: "del", text: "b" });
  });

  it("falls back to whole-text markers beyond the cap", () => {
    const big = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const ops = diffWords(big, `${big} extra`, 10);
    expect(ops.map((o) => o.type)).toEqual(["del", "add"]);
  });
});

describe("validateAiNodes", () => {
  it("accepts text-only structural nodes with safe marks", () => {
    expect(
      validateAiNodes([
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Plan" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }],
        },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [para("item")] }],
        },
      ]),
    ).toBeNull();
  });

  it("accepts safe links and rejects unsafe ones", () => {
    const good = [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] }];
    expect(validateAiNodes(good)).toBeNull();
    const bad = [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }];
    expect(validateAiNodes(bad)).toContain("unsafe link");
  });

  it("rejects images, unknown nodes, and empty payloads", () => {
    expect(validateAiNodes([])).toContain("no content");
    expect(validateAiNodes("nope")).toContain("no content");
    expect(validateAiNodes([{ type: "image", attrs: { src: "https://x/y.png" } }])).toContain("unsupported block");
    expect(validateAiNodes([{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "evil" }] }] }])).toContain("unsupported formatting");
  });
});

describe("folderChain", () => {
  const map = new Map([
    ["root", { id: "root", parentFolderId: null }],
    ["a", { id: "a", parentFolderId: "root" }],
    ["b", { id: "b", parentFolderId: "a" }],
  ]);

  it("walks to the root", () => {
    expect(folderChain("b", map)).toEqual(["b", "a", "root"]);
  });

  it("is cycle-safe", () => {
    const cyclic = new Map([
      ["x", { id: "x", parentFolderId: "y" }],
      ["y", { id: "y", parentFolderId: "x" }],
    ]);
    expect(folderChain("x", cyclic)).toEqual(["x", "y"]);
  });
});

describe("responseMetaOf", () => {
  it("parses response authorship", () => {
    expect(responseMetaOf({ response: { requestId: "r", providerId: "p", submitted: true } })).toEqual({
      requestId: "r",
      providerId: "p",
      submitted: true,
    });
  });

  it("returns null for normal files and malformed metadata", () => {
    expect(responseMetaOf({})).toBeNull();
    expect(responseMetaOf(null)).toBeNull();
    expect(responseMetaOf({ response: { requestId: "r" } })).toBeNull();
  });
});

describe("canViewFile / canEditFile permission matrix", () => {
  const folders = new Map([
    ["root", { id: "root", parentFolderId: null }],
    ["shared", { id: "shared", parentFolderId: "root" }],
    ["private", { id: "private", parentFolderId: "root" }],
  ]);
  const file = (id: string, folderId: string, metadata: unknown = {}) => ({ id, folderId, metadata });
  const base: ProjectAccess = {
    role: "none",
    canView: false,
    canEdit: false,
    canManage: false,
    via: "none",
    shares: [],
    groupAdmin: false,
  };
  const provider: ProjectAccess = {
    ...base,
    role: "provider",
    canView: true,
    via: "share",
    shares: [{ id: "s", requestId: "r", permission: "view", fileIds: ["f1"], folderIds: ["shared"], expiresAt: null }],
  };

  it("grants members full visibility, edit by role", () => {
    const editor: ProjectAccess = { ...base, role: "editor", canView: true, canEdit: true, via: "member" };
    const viewer: ProjectAccess = { ...base, role: "viewer", canView: true, via: "member" };
    expect(canViewFile(editor, file("f1", "private"), folders, "u")).toBe(true);
    expect(canEditFile(editor, file("f1", "private"), "u")).toBe(true);
    expect(canEditFile(viewer, file("f1", "private"), "u")).toBe(false);
  });

  it("restricts providers to shared files and folders", () => {
    expect(canViewFile(provider, file("f1", "private"), folders, "p")).toBe(true);
    expect(canViewFile(provider, file("f2", "shared"), folders, "p")).toBe(true);
    expect(canViewFile(provider, file("f9", "private"), folders, "p")).toBe(false);
    expect(canEditFile(provider, file("f1", "private"), "p")).toBe(false);
  });

  it("lets providers always open their own responses", () => {
    const mine = file("resp", "private", { response: { requestId: "r", providerId: "p", submitted: false } });
    expect(canViewFile(provider, mine, folders, "p")).toBe(true);
    expect(canEditFile(provider, mine, "p")).toBe(true);
  });

  it("keeps responses author-only — even owners cannot rewrite them", () => {
    const owner: ProjectAccess = { ...base, role: "owner", canView: true, canEdit: true, canManage: true, via: "owner" };
    const resp = file("resp", "private", { response: { requestId: "r", providerId: "p", submitted: true } });
    expect(canViewFile(owner, resp, folders, "owner")).toBe(true);
    expect(canEditFile(owner, resp, "owner")).toBe(false);
    expect(canEditFile(owner, resp, "p")).toBe(true);
  });

  it("denies strangers everything", () => {
    expect(canViewFile(base, file("f1", "shared"), folders, "stranger")).toBe(false);
    expect(canEditFile(base, file("f1", "shared"), "stranger")).toBe(false);
  });
});

describe("project validation schemas", () => {
  it("accepts provider responses with defaults", () => {
    const parsed = providerResponseSchema.safeParse({ title: "Offer" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.documentType).toBe("response");
      expect(parsed.data.submit).toBe(false);
    }
  });

  it("rejects blank response titles", () => {
    expect(providerResponseSchema.safeParse({ title: "  " }).success).toBe(false);
  });

  it("covers every assistant task id", () => {
    for (const task of [
      "summarize",
      "missing_info",
      "improve",
      "rewrite_selection",
      "generate_section",
      "proposal",
      "budget",
      "research",
      "loan_request",
      "support_request",
      "analyze_responses",
      "compare_versions",
      "ask",
    ]) {
      expect(projectAssistSchema.safeParse({ task }).success).toBe(true);
    }
    expect(projectAssistSchema.safeParse({ task: "hack" }).success).toBe(false);
  });

  it("validates organizations and verification flows", () => {
    expect(organizationSchema.safeParse({ name: "ACME" }).success).toBe(true);
    expect(organizationSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(verificationSubmitSchema.safeParse({ evidenceDocumentIds: [] }).success).toBe(false);
    expect(verificationSubmitSchema.safeParse({ evidenceDocumentIds: ["d1"] }).success).toBe(true);
    expect(
      verificationDecisionSchema.safeParse({ verificationId: "v", decision: "approved" }).success,
    ).toBe(true);
    expect(verificationDecisionSchema.safeParse({ verificationId: "v", decision: "maybe" }).success).toBe(false);
  });
});
