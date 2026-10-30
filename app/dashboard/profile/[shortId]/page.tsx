import { Suspense } from "react";
import { UserProfilePage } from "@/components/profile/UserProfilePage";
import { SkeletonList } from "@/components/ui/Feedback";

// This detail route depends on URL params to select a user profile, so its
// navigation is allowed to wait for that data rather than validate as instant.
export const instant = false;

export default function ProfileByIdPage({ params }: { params: Promise<{ shortId: string }> }) {
  return <Suspense fallback={<SkeletonList rows={3} />}><ProfileContent params={params} /></Suspense>;
}

async function ProfileContent({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = await params;
  return <UserProfilePage shortId={shortId.toUpperCase()} />;
}
