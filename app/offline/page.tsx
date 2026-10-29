import Link from "next/link";

/** Offline fallback rendered when server-dependent actions cannot complete. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-black">You are offline</h1>
        <p className="mb-4 mt-2 text-sm text-neutral-600">
          TIXCONNECKT needs a connection for your dashboard, messages, and wallet. Check your
          connection and try again.
        </p>
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Retry
        </Link>
      </div>
    </main>
  );
}
