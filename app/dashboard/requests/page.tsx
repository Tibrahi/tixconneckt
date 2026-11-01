import { RequestsPage } from "@/components/requests/RequestsPage";
import { requireUser } from "@/lib/session";

export const instant = false;

export default async function RequestsRoute() {
  const user = await requireUser();
  return <RequestsPage accountRole={user.role} />;
}
