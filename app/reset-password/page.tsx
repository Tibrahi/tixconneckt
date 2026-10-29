"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-black">TIXCONNECKT</p>
        {done ? (
          <section className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
            <h1 className="text-lg font-semibold text-black">Password changed</h1>
            <p className="mb-4 mt-1 text-sm text-neutral-600">
              Your password was changed and other sessions were signed out.
            </p>
            <Link href={ROUTES.login} className="font-medium text-brand-700 hover:underline">
              Sign in with your new password
            </Link>
          </section>
        ) : token ? (
          <ResetPasswordForm token={token} onDone={() => setDone(true)} />
        ) : (
          <section className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
            <h1 className="text-lg font-semibold text-black">Missing reset token</h1>
            <p className="mb-4 mt-1 text-sm text-neutral-600">
              Start recovery again to receive a fresh verification code.
            </p>
            <Link href={ROUTES.forgotPassword} className="font-medium text-brand-700 hover:underline">
              Go to password recovery
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
