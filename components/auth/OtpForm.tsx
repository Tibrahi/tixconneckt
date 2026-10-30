"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
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
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const submitLock = useRef(false);

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

  async function submit(e?: FormEvent, submittedCode?: string) {
    e?.preventDefault();
    const currentCode = submittedCode ?? digits.join("");
    if (!/^[0-9]{6}$/.test(currentCode) || submitLock.current) {
      if (!/^[0-9]{6}$/.test(currentCode))
      setFieldError("Enter the 6-digit code.");
      return;
    }
    submitLock.current = true;
    setFieldError(undefined);
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: currentCode, purpose }),
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
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function updateDigit(index: number, raw: string) {
    const pasted = raw.replace(/[^0-9]/g, "");
    if (pasted.length > 1) {
      const next = Array.from({ length: 6 }, (_, i) => pasted[i] ?? "");
      setDigits(next);
      const target = Math.min(pasted.length, 5);
      inputRefs.current[target]?.focus();
      if (next.every(Boolean)) void submit(undefined, next.join(""));
      return;
    }
    const next = [...digits];
    next[index] = pasted;
    setDigits(next);
    const value = next.join("");
    setFieldError(undefined);
    if (digits && index < 5) inputRefs.current[index + 1]?.focus();
    if (value.length === 6 && /^[0-9]{6}$/.test(value)) void submit(undefined, value);
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
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Verification code</legend>
          <div className="flex gap-2" dir="ltr">
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                ref={(node) => { inputRefs.current[index] = node; }}
                aria-label={`Digit ${index + 1} of 6`}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={index === 0 ? 6 : 1}
                value={digits[index]}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
                  if (event.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
                  if (event.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
                }}
                className="h-12 min-w-0 flex-1 rounded-md border border-neutral-300 text-center font-mono text-xl focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            ))}
          </div>
          {fieldError ? <p className="mt-1 text-sm text-red-700" role="alert">{fieldError}</p> : null}
        </fieldset>
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
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => { setError(null); void submit(); }} /> : null}
    </section>
  );
}
