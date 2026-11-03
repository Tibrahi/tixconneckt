"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_PERSONAS } from "@/lib/demo";
import { Button } from "@/components/ui/Button";
import { ErrorDialog } from "@/components/ui/Modal";

/**
 * Open demo role list: one button per role, each signing straight in and
 * redirecting to that role's start page. No password, OTP, or email step.
 */
export function DemoPersonaList() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(key: string) {
    if (pending) return;
    setPending(key);
    setError(null);
    try {
      const res = await fetch("/api/demo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: key }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { redirectTo: string };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "Demo entry failed. Please try again.");
        return;
      }
      router.replace(body.data.redirectTo);
      router.refresh();
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {DEMO_PERSONAS.map((persona) => (
        <div
          key={persona.key}
          className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-black">{persona.label}</p>
            <p className="mt-0.5 text-sm text-neutral-600">{persona.description}</p>
          </div>
          <Button
            variant="auth"
            className="shrink-0 sm:w-44"
            loading={pending === persona.key}
            disabled={pending !== null}
            onClick={() => enter(persona.key)}
          >
            {pending === persona.key ? "Opening…" : `Test ${persona.label}`}
          </Button>
        </div>
      ))}
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </div>
  );
}
