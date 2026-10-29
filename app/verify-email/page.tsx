"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { OtpForm } from "@/components/auth/OtpForm";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [started, setStarted] = useState(Boolean(params.get("email")));

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-black">TIXCONNECKT</p>
        {started && email ? (
          <OtpForm
            email={email}
            purpose="register"
            submitLabel="Verify and activate"
            onVerified={() => router.push(ROUTES.login)}
            onBack={() => setStarted(false)}
          />
        ) : (
          <section className="rounded-lg border border-neutral-200 bg-white p-6">
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
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
