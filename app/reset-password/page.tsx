"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);

  return (
    <AuthLayout variant="reset">
        {done ? (
          <section className="rounded-lg border border-neutral-200/90 bg-white p-6 text-center shadow-card">
            <h1 className="text-lg font-semibold text-black">Password changed</h1>
            <p className="mb-4 mt-1 text-sm text-neutral-600">
              Your password was changed and other sessions were signed out.
            </p>
            <Link href={ROUTES.login} className="font-medium text-[#1447e6] hover:underline">
              Sign in with your new password
            </Link>
          </section>
        ) : token ? (
          <ResetPasswordForm token={token} onDone={() => setDone(true)} />
        ) : (
          <section className="rounded-lg border border-neutral-200/90 bg-white p-6 text-center shadow-card">
            <h1 className="text-lg font-semibold text-black">Missing reset token</h1>
            <p className="mb-4 mt-1 text-sm text-neutral-600">
              Start recovery again to receive a fresh verification code.
            </p>
            <Link href={ROUTES.forgotPassword} className="font-medium text-[#1447e6] hover:underline">
              Go to password recovery
            </Link>
          </section>
        )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
