import { Suspense } from "react";
import { OrganizationDetailPage } from "@/components/organizations/OrganizationDetailPage";
import { SkeletonList } from "@/components/ui/Feedback";

export default function OrganizationRoute({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SkeletonList rows={4} />}><OrganizationContent params={params} /></Suspense>;
}

async function OrganizationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrganizationDetailPage orgId={id} />;
}
