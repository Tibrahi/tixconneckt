"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { OtpForm } from "@/components/auth/OtpForm";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [started, setStarted] = useState(Boolean(params.get("email")));

  return (
    <AuthLayout variant="verify">
        {started && email ? (
          <OtpForm
            email={email}
            purpose="register"
            submitLabel="Verify and activate"
            onVerified={() => router.push(ROUTES.login)}
            onBack={() => setStarted(false)}
          />
        ) : (
          <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card">
            <h1 className="text-lg font-semibold text-black">Verify your email</h1>
            <p className="mb-4 mt-1 text-sm text-neutral-600">
              Enter the email you registered with to verify its code.
            </p>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) setStarted(true);
              }}
            >
              <TextField
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button variant="auth" type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </section>
        )}
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
