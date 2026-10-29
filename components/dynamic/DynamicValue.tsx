"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";

/**
 * Renders saved flexible JSON dynamically (correction §6).
 * - Known shapes get suitable controls; unknown shapes get safe defaults.
 * - Nested objects and arrays are supported (depth-guarded).
 * - Never renders untrusted HTML — text only.
 * - File references become secure, owner-checked attachment links.
 * - Malformed data shows a fallback instead of crashing the page.
 */

const MAX_DEPTH = 6;
const FILE_KEY_RE = /(file|document|attachment|audio|storage).*?(id|key)$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;

function prettyKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function AttachmentLink({ label, documentId }: { label: string; documentId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reveal() {
    if (url) {
      window.open(url, "_blank", "noopener");
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/url`, {
        cache: "no-store",
      });
      const body = (await res.json()) as { ok: boolean; data?: { url: string } };
      if (!res.ok || !body.ok || !body.data) throw new Error();
      setUrl(body.data.url);
      window.open(body.data.url, "_blank", "noopener");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Icon name="paperclip" />
      <span className="font-mono text-xs text-neutral-600">{label}</span>
      <Button size="sm" variant="secondary" loading={busy} onClick={reveal}>
        {url ? "Open again" : "Open securely"}
      </Button>
      {failed ? <span className="text-xs text-red-700">Unavailable — you may lack access.</span> : null}
    </span>
  );
}

function LeafValue({ pathKey, value }: { pathKey: string; value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-neutral-500">Not provided</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-black">
        <Icon name={value ? "check" : "xmark"} />
        {value ? "Yes" : "No"}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono text-sm text-black">{String(value)}</span>;
  }
  if (typeof value === "string") {
    const leaf = pathKey.split(".").pop() ?? pathKey;
    if (FILE_KEY_RE.test(leaf) && value.length > 0 && value.length <= 512) {
      return <AttachmentLink label={value} documentId={value} />;
    }
    if (ISO_DATE_RE.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return <span className="font-mono text-sm text-black">{date.toLocaleString()}</span>;
      }
    }
    return <span className="text-sm whitespace-pre-wrap text-black">{value}</span>;
  }
  return <span className="font-mono text-xs text-neutral-500">Unsupported value</span>;
}

export function DynamicValue({
  doc,
  editable = false,
  savingPath = null,
  onSave,
  onRemove,
}: {
  doc: unknown;
  editable?: boolean;
  savingPath?: string | null;
  onSave?: (path: string, value: string) => void;
  onRemove?: (path: string) => void;
}) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (typeof doc !== "object" || doc === null) {
    return <p className="text-sm text-neutral-600">No details saved yet.</p>;
  }

  function renderNode(value: unknown, path: string, depth: number): React.ReactNode {
    if (depth > MAX_DEPTH) {
      return <span className="font-mono text-xs text-neutral-500">Nested too deeply to display</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-sm text-neutral-500">Empty list</span>;
      return (
        <ul className="flex flex-col gap-2">
          {value.map((item, i) => (
            <li
              key={`${path}[${i}]`}
              className="rounded-md border border-neutral-200 bg-white p-2.5"
            >
              {typeof item === "object" && item !== null ? (
                renderNode(item, `${path}[${i}]`, depth + 1)
              ) : (
                <LeafValue pathKey={path} value={item} />
              )}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value);
      if (entries.length === 0) return <span className="text-sm text-neutral-500">Empty</span>;
      return (
        <dl className="flex flex-col gap-3">
          {entries.map(([key, child]) => {
            const childPath = path ? `${path}.${key}` : key;
            const isLeaf =
              child === null || ["string", "number", "boolean"].includes(typeof child);
            return (
              <div key={childPath} className="rounded-md border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                    {prettyKey(key)}
                  </dt>
                  {editable && onRemove ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={`Remove ${key}`}
                      onClick={() => onRemove(childPath)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <dd className="mt-1.5">
                  {editingPath === childPath && isLeaf ? (
                    <span className="flex flex-col gap-2 sm:flex-row">
                      <TextField
                        label={`Edit ${key}`}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <span className="flex items-end gap-2">
                        <Button
                          size="sm"
                          loading={savingPath === childPath}
                          onClick={() => {
                            onSave?.(childPath, draft);
                            setEditingPath(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingPath(null)}>
                          Cancel
                        </Button>
                      </span>
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        {isLeaf ? (
                          <LeafValue pathKey={childPath} value={child} />
                        ) : (
                          renderNode(child, childPath, depth + 1)
                        )}
                      </span>
                      {editable && isLeaf && onSave ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="pen"
                          onClick={() => {
                            setEditingPath(childPath);
                            setDraft(child === null ? "" : String(child));
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      );
    }
    return <LeafValue pathKey={path} value={value} />;
  }

  try {
    return <div className="flex flex-col gap-2">{renderNode(doc, "", 0)}</div>;
  } catch {
    return <p className="text-sm text-red-700">This data couldn't be displayed safely.</p>;
  }
}
