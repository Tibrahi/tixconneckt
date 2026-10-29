import { RequestDetailPage } from "@/components/requests/RequestDetailPage";

export default async function RequestRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetailPage requestId={id} />;
}
