import { notFound } from "next/navigation";
import { UserProfilePageClient } from "@/frontend/components/user-profile-page";
import { isUuid } from "@/shared/is-uuid";

export default async function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!userId || !isUuid(userId)) notFound();
  return <UserProfilePageClient userId={userId} />;
}
