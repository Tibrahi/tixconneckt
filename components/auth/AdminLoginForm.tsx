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

function verifiedRole(data: unknown): string | null {
  if (typeof data === "object" && data !== null && "role" in data) {
    const role = (data as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  }
  return null;
}

/**
 * Dedicated administrator sign-in: same credential + email-OTP flow as the
 * main login, but only administrators continue to /admin. Any other account
 * is told so explicitly instead of landing somewhere surprising.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "otp" | "denied">("credentials");
  const [email, setEmail] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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

  async function signOutToRetry() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* session cookie is httpOnly; a failed call still returns to the form */
    }
    setSigningOut(false);
    form.reset();
    setStep("credentials");
    router.refresh();
  }

  if (step === "denied") {
    return (
      <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Not an administrator">
        <h1 className="text-lg font-semibold text-black">Not an administrator</h1>
        <p className="mb-4 mt-1 text-sm text-neutral-600">
          <span className="font-mono">{email}</span> signed in successfully, but that
          account does not have administrator access.
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <Link href={ROUTES.dashboard} className="font-medium text-[#1447e6] hover:underline">
            Continue to your dashboard
          </Link>
          <button
            type="button"
            onClick={signOutToRetry}
            disabled={signingOut}
            className="text-left font-medium text-[#1447e6] hover:underline disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out and use another account"}
          </button>
        </div>
      </section>
    );
  }

  if (step === "otp") {
    return (
      <OtpForm
        email={email}
        purpose="login"
        emailPending={emailPending}
        onVerified={(data) => {
          if (verifiedRole(data) === "admin") {
            router.replace(ROUTES.admin);
            router.refresh();
          } else {
            setStep("denied");
          }
        }}
        onBack={() => setStep("credentials")}
      />
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Administrator sign in">
      <h1 className="text-lg font-semibold text-black">Administrator sign in</h1>
      <p className="mb-4 mt-1 text-sm text-neutral-600">
        Restricted gate. Use your administrator email and password, then confirm the code we send you.
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
        <Button variant="auth" type="submit" loading={form.formState.isSubmitting} className="w-full">
          Continue
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href={ROUTES.forgotPassword} className="font-medium text-[#1447e6] hover:underline">
          Forgot password?
        </Link>
        <Link href={ROUTES.login} className="font-medium text-[#1447e6] hover:underline">
          Standard sign in
        </Link>
      </div>
      <p className="mt-3 text-center text-sm text-neutral-600">
        Setting up the system for the first time?{" "}
        <Link href={ROUTES.adminRegister} className="font-medium text-[#1447e6] hover:underline">
          Create the owner account
        </Link>
      </p>
      {error ? <ErrorDialog message={error} onClose={() => setError(null)} onRetry={() => setError(null)} /> : null}
    </section>
  );
}
