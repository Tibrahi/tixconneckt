import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function FieldWrapper({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-black">
        {label}
        {required ? <span aria-hidden="true" className="text-brand-600"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-neutral-600">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black placeholder:text-neutral-500 focus:border-brand-600 focus:outline-none disabled:bg-neutral-100 disabled:opacity-70";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, id, required, ...rest }: TextFieldProps) {
  const fieldId = id ?? rest.name ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
      <input
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        className={`${CONTROL} ${error ? "border-red-500" : ""}`}
        {...rest}
      />
    </FieldWrapper>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextAreaField({ label, error, hint, id, required, ...rest }: TextAreaFieldProps) {
  const fieldId = id ?? rest.name ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
      <textarea
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        className={`${CONTROL} min-h-24 ${error ? "border-red-500" : ""}`}
        {...rest}
      />
    </FieldWrapper>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

export function SelectField({ label, error, hint, id, required, options, ...rest }: SelectFieldProps) {
  const fieldId = id ?? rest.name ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} required={required} error={error} hint={hint}>
      <select
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        className={`${CONTROL} ${error ? "border-red-500" : ""}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
