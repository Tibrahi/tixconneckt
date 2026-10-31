import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const instant = false;

export default async function RegisterPage() {
  // Session cookies are request-time data: opt out of prerendering so the
  // build never evaluates `new Date()` comparisons at compile time.
  await connection();
  const session = await getSession();
  if (session && session.user.status === "active") {
    redirect(session.user.role === "admin" ? ROUTES.admin : ROUTES.dashboard);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-xl">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-black">TIXCONNECKT</p>
        <RegisterForm />
      </div>
    </main>
  );
}
