"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-black">TIXCONNECKT</p>
        <ForgotPasswordForm
          onToken={(token) => router.push(`${ROUTES.resetPassword}?token=${encodeURIComponent(token)}`)}
        />
      </div>
    </main>
  );
}
