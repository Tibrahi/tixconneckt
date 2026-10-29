"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";
import { OtpForm } from "./OtpForm";

export function ForgotPasswordForm({ onToken }: { onToken: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "We couldn't start recovery. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Your connection was interrupted. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <OtpForm
        email={email.trim()}
        purpose="recovery"
        submitLabel="Verify code"
        onVerified={(data) => {
          const token = (data as { token?: string })?.token;
          if (token) onToken(token);
          else setError("Verification succeeded but no reset token was returned. Please try again.");
        }}
        onBack={() => setSent(false)}
      />
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6" aria-label="Recover password">
      <h1 className="text-lg font-semibold text-black">Recover your password</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-600">
        Enter your account email. If it matches an account, we will send a verification code.
      </p>
      <form onSubmit={request} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" loading={sending} className="w-full">
          Send verification code
        </Button>
      </form>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
