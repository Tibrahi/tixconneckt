import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROUTES } from "@/lib/routes";
import { LoginForm } from "@/components/auth/LoginForm";
import { Skeleton } from "@/components/ui/Feedback";

/**
 * Application entry point: authentication-first. A valid session redirects
 * to the dashboard; otherwise the login form renders (no public landing).
 */
function HomeFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md" aria-busy="true" aria-label="Loading sign in">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-6">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}

async function HomeContent() {
  const session = await getSession();
  if (session && session.user.status === "active") {
    redirect(session.user.role === "admin" ? ROUTES.admin : ROUTES.dashboard);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold tracking-tight text-black">TIXCONNECKT</p>
          <p className="mt-1 text-sm text-neutral-600">
            Connect through skills, projects, and funding.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
