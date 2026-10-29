import { UserProfilePage } from "@/components/profile/UserProfilePage";

export default async function ProfileByIdPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = await params;
  return <UserProfilePage shortId={shortId.toUpperCase()} />;
}
