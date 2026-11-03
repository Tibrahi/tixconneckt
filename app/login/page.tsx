import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { demoModeEnabled } from "@/lib/demo";

export const instant = false;

export default async function LoginPage() {
  // Session cookies are request-time data: opt out of prerendering so the
  // build never evaluates `new Date()` comparisons at compile time.
  await connection();
  const session = await getSession();
  if (session && session.user.status === "active") {
    redirect(session.user.role === "admin" ? ROUTES.admin : ROUTES.dashboard);
  }
  return (
    <AuthLayout variant="login">
      <LoginForm showDemo={demoModeEnabled()} />
    </AuthLayout>
  );
}
