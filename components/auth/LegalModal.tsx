"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * Legal document dialog: the user must scroll through the document before
 * the acknowledge button enables; acceptance is explicit via the form checkbox.
 */
export function LegalModal({
  title,
  docType,
  onAccept,
  onClose,
}: {
  title: string;
  docType: "privacy" | "terms" | "agreement";
  onAccept: () => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [readFully, setReadFully] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/legal/${docType}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ok: boolean; data?: { body: string; version: string } }) => {
        if (!cancelled && data.ok && data.data) {
          setBody(data.data.body);
          setVersion(data.data.version);
        }
      })
      .catch(() => {
        if (!cancelled) setBody("We couldn't load this document. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [docType]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setReadFully(true);
    }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <p className="mb-2 font-mono text-xs text-neutral-600">Version {version || "…"}</p>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-4 text-sm leading-relaxed text-black"
      >
        {body ?? "Loading…"}
      </div>
      {!readFully ? (
        <p className="mt-2 text-xs text-neutral-600">Scroll to the end to finish reading.</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          onClick={() => {
            onAccept();
            onClose();
          }}
          disabled={!readFully || !body}
        >
          I have read this document
        </Button>
      </div>
    </Modal>
  );
}
