import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/session";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { AblyProvider } from "@/components/realtime/AblyProvider";

export const instant = false;

async function AuthenticatedAdmin({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await requireAdmin();
  return (
    <AblyProvider>
      <DashboardShell isAdmin accountRole={user.role} category={user.category} providerKind={user.providerKind}>{children}</DashboardShell>
    </AblyProvider>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthenticatedAdmin>{children}</AuthenticatedAdmin>
    </Suspense>
  );
}
