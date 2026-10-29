"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ROUTES } from "@/lib/routes";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Fields";
import { ErrorDialog } from "@/components/ui/Modal";
import { OtpForm } from "./OtpForm";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await res.json()) as { ok: boolean; data?: { email: string; emailPending?: boolean }; error?: string };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error ?? "We couldn't sign you in. Please try again.");
        return;
      }
      setEmail(body.data.email);
      setEmailPending(body.data.emailPending ?? false);
      setStep("otp");
    } catch {
      setError("Your connection was interrupted. Your entered information is still available. Please try again.");
    }
  }

  if (step === "otp") {
    return (
      <OtpForm
        email={email}
        purpose="login"
        emailPending={emailPending}
        onVerified={() => router.replace(ROUTES.dashboard)}
        onBack={() => setStep("credentials")}
      />
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6" aria-label="Sign in">
      <h1 className="text-lg font-semibold text-black">Sign in</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-600">
        Use your email and password, then confirm the code we send you.
      </p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          {...form.register("email")}
          error={form.formState.errors.email?.message}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          {...form.register("password")}
          error={form.formState.errors.password?.message}
        />
        <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
          Continue
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href={ROUTES.forgotPassword} className="font-medium text-brand-700 hover:underline">
          Forgot password?
        </Link>
        <Link href={ROUTES.register} className="font-medium text-brand-700 hover:underline">
          Create account
        </Link>
      </div>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
