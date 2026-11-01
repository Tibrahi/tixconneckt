import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/session";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { AblyProvider } from "@/components/realtime/AblyProvider";
import { CallProvider } from "@/components/calls/CallProvider";

export const instant = false;

async function AuthenticatedDashboard({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await requireUser();
  return (
    <AblyProvider>
      <CallProvider>
        <DashboardShell isAdmin={user.role === "admin"}>{children}</DashboardShell>
      </CallProvider>
    </AblyProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}
