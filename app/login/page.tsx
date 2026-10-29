import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { LoginForm } from "@/components/auth/LoginForm";

export const instant = false;

export default async function LoginPage() {
  const session = await getSession();
  if (session && session.user.status === "active") {
    redirect(session.user.role === "admin" ? ROUTES.admin : ROUTES.dashboard);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-black">TIXCONNECKT</p>
        <LoginForm />
      </div>
    </main>
  );
}
