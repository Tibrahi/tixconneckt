import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { SocketProvider } from "@/components/realtime/SocketProvider";

export const instant = false;

async function AuthenticatedDashboard({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <SocketProvider>
      <DashboardShell isAdmin={user.role === "admin"}>{children}</DashboardShell>
    </SocketProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}
