import { SupportRequestsPage } from "@/components/support/SupportRequestsPage";
import { requireUser } from "@/lib/session";

export const instant = false;

export default async function SupportRoute() {
  const user = await requireUser();
  return <SupportRequestsPage accountRole={user.role} accountCategory={user.category} providerKind={user.providerKind} />;
}
