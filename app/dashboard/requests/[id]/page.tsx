import { Suspense } from "react";
import { RequestDetailPage } from "@/components/requests/RequestDetailPage";
import { SkeletonList } from "@/components/ui/Feedback";

export default function RequestRoute({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<SkeletonList rows={4} />}><RequestContent params={params} /></Suspense>;
}

async function RequestContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetailPage requestId={id} />;
}
