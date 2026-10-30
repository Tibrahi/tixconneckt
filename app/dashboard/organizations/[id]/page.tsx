import { OrganizationDetailPage } from "@/components/organizations/OrganizationDetailPage";

export default async function OrganizationRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrganizationDetailPage orgId={id} />;
}
