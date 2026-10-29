import Link from "next/link";
import { ROUTES } from "@/lib/routes";

/** Useful not-found page instead of a broken or blank screen. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-black">Page not found</h1>
        <p className="mb-4 mt-2 text-sm text-neutral-600">
          This page does not exist or you do not have access to it.
        </p>
        <Link href={ROUTES.dashboard} className="font-medium text-brand-700 hover:underline">
          Go to your dashboard
        </Link>
      </div>
    </main>
  );
}
