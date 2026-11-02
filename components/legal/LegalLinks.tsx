"use client";

import { useState } from "react";
import { LegalModal, type LegalDocumentType } from "./LegalModal";

const DOCUMENTS: Array<{ type: LegalDocumentType; label: string }> = [
  { type: "privacy", label: "Privacy policy" },
  { type: "terms", label: "Terms of service" },
  { type: "agreement", label: "User agreement" },
];

const TITLES: Record<LegalDocumentType, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  agreement: "User Agreement",
};

export function LegalLinks({
  className = "",
  linkClassName = "",
  separator = "",
}: {
  className?: string;
  linkClassName?: string;
  separator?: string;
}) {
  const [openDocument, setOpenDocument] = useState<LegalDocumentType | null>(null);

  return (
    <>
      <div className={className}>
        {DOCUMENTS.map((document, index) => (
          <span key={document.type}>
            {index > 0 ? separator : null}
            <button
              type="button"
              onClick={() => setOpenDocument(document.type)}
              className={linkClassName}
            >
              {document.label}
            </button>
          </span>
        ))}
      </div>
      {openDocument ? (
        <LegalModal
          title={TITLES[openDocument]}
          docType={openDocument}
          onClose={() => setOpenDocument(null)}
        />
      ) : null}
    </>
  );
}
