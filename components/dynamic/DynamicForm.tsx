"use client";

import { useState } from "react";
import type { FormFieldDef } from "@/lib/ai-form-definition";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Fields";

/**
 * Renders a validated dynamic field definition (correction §3, §6).
 * Definitions are data: labels/descriptions render as plain text, values
 * are controlled inputs, and users can append their own custom fields.
 */

export interface CustomField {
  key: string;
  value: string;
}

function FieldControl({
  field,
  value,
  onChange,
  error,
}: {
  field: FormFieldDef;
  value: unknown;
  onChange: (value: string | boolean) => void;
  error?: string;
}) {
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  switch (field.type) {
    case "longtext":
      return (
        <TextAreaField
          label={field.label}
          hint={field.description}
          required={field.required}
          rows={4}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
    case "number":
      return (
        <TextField
          label={field.label}
          hint={field.description}
          required={field.required}
          type="number"
          inputMode="decimal"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
    case "boolean":
      return (
        <SelectField
          label={field.label}
          hint={field.description}
          required={field.required}
          value={typeof value === "boolean" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "true")}
          options={[
            { value: "", label: "Choose…" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          error={error}
        />
      );
    case "date":
      return (
        <TextField
          label={field.label}
          hint={field.description}
          required={field.required}
          type="date"
          value={str.slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
    case "enum":
      return (
        <SelectField
          label={field.label}
          hint={field.description}
          required={field.required}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          options={[
            { value: "", label: "Choose…" },
            ...(field.options ?? []).map((o) => ({ value: o, label: o })),
          ]}
          error={error}
        />
      );
    case "file":
      return (
        <TextField
          label={field.label}
          hint={field.description ?? "Paste an upload reference from the upload step."}
          required={field.required}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
    case "text":
    default:
      return (
        <TextField
          label={field.label}
          hint={field.description}
          required={field.required}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          error={error}
        />
      );
  }
}

export function DynamicForm({
  fields,
  values,
  fieldErrors = {},
  onChange,
  customFields,
  onCustomFieldsChange,
  disabled = false,
}: {
  fields: FormFieldDef[];
  values: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  onChange: (key: string, value: string | boolean) => void;
  customFields: CustomField[];
  onCustomFieldsChange: (fields: CustomField[]) => void;
  disabled?: boolean;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  function addCustomField() {
    const key = newKey.trim();
    if (!key) return;
    onCustomFieldsChange([...customFields, { key, value: newValue }]);
    setNewKey("");
    setNewValue("");
  }

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(v) => onChange(field.key, v)}
          error={fieldErrors[field.key]}
        />
      ))}

      {customFields.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3">
          <p className="text-sm font-semibold text-black">Additional context</p>
          {customFields.map((f, i) => (
            <div key={`${f.key}-${i}`} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <TextField
                label="Field name"
                value={f.key}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...customFields];
                  next[i] = { ...next[i], key: e.target.value };
                  onCustomFieldsChange(next);
                }}
              />
              <TextField
                label="Value"
                value={f.value}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...customFields];
                  next[i] = { ...next[i], value: e.target.value };
                  onCustomFieldsChange(next);
                }}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon="trash"
                  aria-label={`Remove ${f.key}`}
                  disabled={disabled}
                  onClick={() => onCustomFieldsChange(customFields.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <TextField
          label="New field name"
          placeholder="e.g. timeline"
          value={newKey}
          disabled={disabled}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <TextField
          label="Value"
          placeholder="Optional value"
          value={newValue}
          disabled={disabled}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <div className="flex items-end">
          <Button type="button" variant="secondary" size="sm" icon="plus" disabled={disabled} onClick={addCustomField}>
            Add field
          </Button>
        </div>
      </div>
    </div>
  );
}
