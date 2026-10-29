import { requireAdmin } from "@/lib/session";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SocketProvider } from "@/components/realtime/SocketProvider";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <SocketProvider>
      <DashboardShell isAdmin>{children}</DashboardShell>
    </SocketProvider>
  );
}
