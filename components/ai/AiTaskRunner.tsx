"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormFieldDef } from "@/lib/ai-form-definition";
import { Button } from "@/components/ui/Button";
import { PendingIntegration } from "@/components/ui/Feedback";
import { ErrorDialog } from "@/components/ui/Modal";
import { DynamicForm, type CustomField } from "@/components/dynamic/DynamicForm";
import { DynamicValue } from "@/components/dynamic/DynamicValue";

/**
 * Reusable dynamic AI task runner (correction §3).
 * 1. Asks the server which inputs the task genuinely needs (given context).
 * 2. Renders those inputs from the validated definition + custom fields.
 * 3. Submits to the configured Muse Spark integration.
 * 4. Renders the SAVED record dynamically — never an assumed shape.
 * 5. Lets the owner edit, extend, regenerate, or remove result fields.
 */

interface SavedRecord {
  id: string;
  recordType: string;
  doc: Record<string, unknown>;
  revision: number;
  status: string;
  provenance: Record<string, unknown>;
  updatedAt: string;
}

export function AiTaskRunner({
  taskId,
  available,
  recordType = "ai_result",
  projectId,
  title = "Ask the assistant",
  description,
}: {
  taskId: string;
  available: Record<string, unknown>;
  recordType?: string;
  projectId?: string;
  title?: string;
  description?: string;
}) {
  const [fields, setFields] = useState<FormFieldDef[] | null>(null);
  const [prefillKeys, setPrefillKeys] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [running, setRunning] = useState(false);
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [record, setRecord] = useState<SavedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);

  const availableKey = JSON.stringify(available);

  const loadFields = useCallback(async () => {
    setFields(null);
    setError(null);
    try {
      const res = await fetch("/api/ai/tasks/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, available: JSON.parse(availableKey) }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { fields: FormFieldDef[]; prefill: Record<string, unknown> };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "The assistant task is unavailable.");
        return;
      }
      setFields(body.data.fields);
      setPrefillKeys(Object.keys(body.data.prefill ?? {}));
    } catch {
      setError("Your connection was interrupted. Please try again.");
    }
  }, [taskId, availableKey]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  async function run() {
    setRunning(true);
    setError(null);
    setPendingReason(null);
    setFieldErrors({});
    try {
      const merged: Record<string, unknown> = {
        ...(JSON.parse(availableKey) as Record<string, unknown>),
        ...values,
      };
      for (const f of customFields) {
        if (f.key.trim()) merged[f.key.trim()] = f.value;
      }
      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, values: merged, recordType, projectId }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { pending?: boolean; pendingReason?: string; record?: SavedRecord; values?: Record<string, unknown> };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "The assistant failed. Your input is preserved — retry when ready.");
        return;
      }
      if (body.data.pending) {
        setPendingReason(body.data.pendingReason ?? "Muse Spark is not configured");
        return;
      }
      if (body.data.record) setRecord(body.data.record);
    } catch {
      setError("Your connection was interrupted. Your input is preserved — retry when ready.");
    } finally {
      setRunning(false);
    }
  }

  async function mutateRecord(update: { set?: Record<string, unknown>; remove?: string[] }, path: string | null) {
    if (!record) return;
    setSavingPath(path);
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...update, expectedRevision: record.revision }),
      });
      const body = (await res.json()) as { ok: boolean; data?: { record: SavedRecord }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't update this result. Please try again.");
        return;
      }
      setRecord(body.data.record);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setSavingPath(null);
    }
  }

  async function deleteRecord() {
    if (!record) return;
    try {
      const res = await fetch(`/api/records/${encodeURIComponent(record.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRecord(null);
    } catch {
      setError("We couldn't remove this result. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-black">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-neutral-600">{description}</p> : null}
        {prefillKeys.length > 0 ? (
          <p className="mt-1 text-xs text-neutral-600">
            Already known — you won&rsquo;t be asked again: {prefillKeys.join(", ")}.
          </p>
        ) : null}
      </div>

      {fields === null && !error ? (
        <p className="text-sm text-neutral-600">Figuring out what&rsquo;s needed…</p>
      ) : null}

      {fields !== null && !record ? (
        <>
          {fields.length === 0 ? (
            <p className="text-sm text-neutral-600">
              Everything needed is already available — run it, or add extra context below.
            </p>
          ) : null}
          <DynamicForm
            fields={fields}
            values={values}
            fieldErrors={fieldErrors}
            onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
            customFields={customFields}
            onCustomFieldsChange={setCustomFields}
            disabled={running}
          />
          <div>
            <Button loading={running} onClick={run}>
              Run assistant
            </Button>
          </div>
        </>
      ) : null}

      {pendingReason ? (
        <PendingIntegration name="Muse Spark" detail={pendingReason} />
      ) : null}

      {record ? (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-black">
              Saved result <span className="font-mono text-xs font-normal text-neutral-600">(revision {record.revision})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => { setRecord(null); run(); }}>
                Regenerate
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRecord(null)}>
                Ask something else
              </Button>
              <Button size="sm" variant="danger" icon="trash" onClick={deleteRecord}>
                Remove
              </Button>
            </div>
          </div>
          <DynamicValue
            doc={record.doc}
            editable
            savingPath={savingPath}
            onSave={(path, value) => mutateRecord({ set: { [path]: value } }, path)}
            onRemove={(path) => mutateRecord({ remove: [path] }, path)}
          />
        </div>
      ) : null}

      {error ? <ErrorDialog message={error} onClose={() => setError(null)} /> : null}
    </div>
  );
}
