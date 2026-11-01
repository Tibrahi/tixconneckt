import { WalletPage } from "@/components/wallet/WalletPage";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

export const instant = false;

export default async function WalletRoute() {
  const user = await requireUser();
  if (user.role === "provider" || user.category === "university" || user.category === "government") redirect(ROUTES.dashboard);
  return <WalletPage />;
}
