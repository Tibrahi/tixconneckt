"use client";

import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  const router = useRouter();
  return (
    <AuthLayout variant="forgot">
      <ForgotPasswordForm
        onToken={(token) => router.push(`${ROUTES.resetPassword}?token=${encodeURIComponent(token)}`)}
      />
    </AuthLayout>
  );
}
