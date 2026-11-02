"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export type LegalDocumentType = "privacy" | "terms" | "agreement";

export function LegalModal({
  title,
  docType,
  onClose,
}: {
  title: string;
  docType: LegalDocumentType;
  onClose: () => void;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/legal/${docType}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { ok: boolean; data?: { body: string; version: string } }) => {
        if (cancelled) return;
        if (data.ok && data.data) {
          setBody(data.data.body);
          setVersion(data.data.version);
        } else {
          setLoadFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [docType]);

  return (
    <Modal title={title} onClose={onClose} wide>
      <p className="mb-3 font-mono text-xs text-neutral-600">Version {version || (body ? "—" : "Loading")}</p>
      <article className="max-h-[65vh] overflow-y-auto rounded-md border border-neutral-200 bg-white p-5 text-sm leading-7 text-black sm:p-7">
        {body ? <div className="whitespace-pre-wrap">{body}</div> : loadFailed ? "We couldn't load this document. Please close and try again." : "Loading document…"}
      </article>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
