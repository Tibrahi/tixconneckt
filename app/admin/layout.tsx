import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { SocketProvider } from "@/components/realtime/SocketProvider";

export const instant = false;

async function AuthenticatedAdmin({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <SocketProvider>
      <DashboardShell isAdmin>{children}</DashboardShell>
    </SocketProvider>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthenticatedAdmin>{children}</AuthenticatedAdmin>
    </Suspense>
  );
}
