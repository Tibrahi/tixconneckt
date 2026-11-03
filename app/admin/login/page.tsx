import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

export const instant = false;

/**
 * Dedicated admin sign-in. Public by design (see isPublicAdminAuthPath):
 * administrators must be able to reach the gate before any session exists.
 */
export default async function AdminLoginPage() {
  await connection();
  const session = await getSession();
  if (session && session.user.status === "active") {
    if (session.user.role === "admin") redirect(ROUTES.admin);
    return (
      <AuthLayout variant="login">
        <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Already signed in">
          <h1 className="text-lg font-semibold text-black">Already signed in</h1>
          <p className="mb-4 mt-1 text-sm text-neutral-600">
            <span className="font-mono">{session.user.email}</span> is signed in but is
            not an administrator.
          </p>
          <Link href={ROUTES.dashboard} className="text-sm font-medium text-[#1447e6] hover:underline">
            Continue to your dashboard
          </Link>
        </section>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout variant="login">
      <AdminLoginForm />
    </AuthLayout>
  );
}
