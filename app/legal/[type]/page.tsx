import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS } from "@/lib/legal-content";
import { ROUTES } from "@/lib/routes";

export function generateStaticParams() {
  return [{ type: "privacy" }, { type: "terms" }, { type: "agreement" }];
}

export default function LegalPage({ params }: { params: Promise<{ type: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl px-4 py-10" aria-busy="true">
          <p className="text-sm font-bold text-black">TIXCONNECKT</p>
          <p className="mt-6 text-sm text-neutral-600">Loading document...</p>
        </main>
      }
    >
      <LegalDocument params={params} />
    </Suspense>
  );
}

async function LegalDocument({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const doc = LEGAL_DOCUMENTS.find((d) => d.type === type);
  if (!doc) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl bg-white px-4 py-10">
      <p className="text-sm font-bold tracking-tight text-black">TIXCONNECKT</p>
      <h1 className="mt-2 text-2xl font-bold text-black">{doc.title}</h1>
      <p className="mt-1 font-mono text-xs text-neutral-600">Version {doc.version}</p>
      <article className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-black">
        {doc.body}
      </article>
      <p className="mt-8 text-sm">
        <Link href={ROUTES.register} className="font-medium text-brand-700 hover:underline">
          Back to registration
        </Link>
      </p>
    </main>
  );
}
