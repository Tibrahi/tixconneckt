import Link from "next/link";
import { connection } from "next/server";
import { demoModeEnabled } from "@/lib/demo";
import { ROUTES } from "@/lib/routes";
import { DemoPersonaList } from "@/components/demo/DemoPersonaList";

export const instant = false;

/**
 * Open demo mode: pick a role and walk straight in. Public and
 * request-rendered so the DEMO_MODE kill switch applies without a rebuild.
 */
export default async function DemoPage() {
  await connection();
  if (!demoModeEnabled()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-black">Demo mode is disabled</h1>
          <p className="mb-4 mt-1 text-sm text-neutral-600">
            Open evaluation access is currently turned off on this system.
          </p>
          <Link href={ROUTES.landing} className="text-sm font-medium text-[#1447e6] hover:underline">
            Back to home
          </Link>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1447e6]">Open demo mode</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black">Test the system as any role</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-neutral-600">
          No account, password, or verification code needed. Choose a role to sign
          straight in with a demo account and land on that role&apos;s start page.
        </p>
        <DemoPersonaList />
        <p className="mt-6 text-center text-sm text-neutral-600">
          Prefer a real account?{" "}
          <Link href={ROUTES.register} className="font-medium text-[#1447e6] hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
