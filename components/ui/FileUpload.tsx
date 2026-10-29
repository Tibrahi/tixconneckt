"use client";

import { useRef, useState } from "react";
import { Button } from "./Button";

export function FileUpload({
  label,
  accept = ".pdf,.png,.jpg,.jpeg,.txt",
  maxBytes = 10 * 1024 * 1024,
  onSelect,
  error,
}: {
  label: string;
  accept?: string;
  maxBytes?: number;
  onSelect: (file: File) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-black">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          aria-label={label}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > maxBytes) {
              setLocalError(`File exceeds the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit.`);
              return;
            }
            if (file.size <= 0) {
              setLocalError("File is empty.");
              return;
            }
            setLocalError(null);
            setFileName(file.name);
            onSelect(file);
          }}
        />
        <Button variant="secondary" icon="upload" onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
        <span className="font-mono text-xs text-neutral-600">
          {fileName ?? "PDF, PNG, JPEG, or TXT up to 10 MB"}
        </span>
      </div>
      {localError || error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {localError ?? error}
        </p>
      ) : null}
    </div>
  );
}
