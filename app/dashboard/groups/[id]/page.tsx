import { GroupDetailPage } from "@/components/groups/GroupDetailPage";

export const instant = false;

export default async function GroupRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupDetailPage groupId={id} />;
}
