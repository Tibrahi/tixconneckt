"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";
import { PendingIntegration } from "@/components/ui/Feedback";

export function OtpForm({
  email,
  purpose,
  emailPending,
  onVerified,
  onBack,
  submitLabel = "Verify and continue",
}: {
  email: string;
  purpose: "register" | "login" | "recovery";
  emailPending?: boolean;
  onVerified: (data?: unknown) => void;
  onBack?: () => void;
  submitLabel?: string;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const endpoint =
    purpose === "register"
      ? "/api/auth/verify-registration"
      : purpose === "login"
        ? "/api/auth/verify-login"
        : "/api/auth/recovery/confirm?step=confirm";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[0-9]{6}$/.test(code.trim())) {
      setFieldError("Enter the 6-digit code.");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim(), purpose }),
      });
      const body = (await res.json()) as { ok: boolean; data?: unknown; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Verification failed. Please try again.");
        return;
      }
      onVerified(body.data);
    } catch {
      setError("Your connection was interrupted. Your code is still available. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Could not resend the code.");
        return;
      }
      setCooldown(60);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6" aria-label="Verify code">
      <h1 className="text-lg font-semibold text-black">Check your email</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-600">
        We sent a 6-digit code to <span className="font-mono">{email}</span>. It expires in 10
        minutes.
      </p>
      {emailPending ? (
        <div className="mb-4">
          <PendingIntegration name="Email delivery" detail="Email sending is not configured on this server yet, so the code may not arrive. Contact the administrator for verification." />
        </div>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          error={fieldError}
        />
        <Button type="submit" loading={submitting} className="w-full">
          {submitLabel}
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        {onBack ? (
          <button type="button" onClick={onBack} className="font-medium text-brand-700 hover:underline">
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={resend}
          disabled={resending || cooldown > 0}
          className="font-medium text-brand-700 hover:underline disabled:opacity-60"
        >
          {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
