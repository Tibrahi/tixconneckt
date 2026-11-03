import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AdminBootstrapForm } from "@/components/auth/AdminBootstrapForm";

export const instant = false;

/**
 * Owner bootstrap. Public by design (see isPublicAdminAuthPath), but the form
 * renders only while zero admins exist — and never when the admin count is
 * unknown (database unreachable). The API enforces the same rule, so a forged
 * request cannot create a second way in.
 */
export default async function AdminRegisterPage() {
  await connection();
  const session = await getSession();
  if (session && session.user.status === "active" && session.user.role === "admin") {
    redirect(ROUTES.admin);
  }

  let adminCount: number | null = null;
  try {
    const [row] = await getDb()
      .select({ n: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    adminCount = row?.n ?? 0;
  } catch {
    adminCount = null;
  }

  if (adminCount === null) {
    return (
      <AuthLayout variant="register">
        <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Service temporarily unavailable">
          <h1 className="text-lg font-semibold text-black">Service temporarily unavailable</h1>
          <p className="mb-4 mt-1 text-sm text-neutral-600">
            Owner setup cannot verify the system state right now. Please try again shortly.
          </p>
          <Link href={ROUTES.adminLogin} className="text-sm font-medium text-[#1447e6] hover:underline">
            Go to administrator sign in
          </Link>
        </section>
      </AuthLayout>
    );
  }

  if (adminCount > 0) {
    return (
      <AuthLayout variant="register">
        <section className="rounded-lg border border-neutral-200/90 bg-white p-6 shadow-card" aria-label="Administration already set up">
          <h1 className="text-lg font-semibold text-black">Administration is already set up</h1>
          <p className="mb-4 mt-1 text-sm text-neutral-600">
            The owner account exists. New administrators are added by an existing
            administrator from user management.
          </p>
          <Link href={ROUTES.adminLogin} className="text-sm font-medium text-[#1447e6] hover:underline">
            Go to administrator sign in
          </Link>
        </section>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="register">
      <AdminBootstrapForm />
    </AuthLayout>
  );
}
