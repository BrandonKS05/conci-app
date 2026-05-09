import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/shared/is-uuid";

/** @deprecated Host setup no longer uses a separate overview — collaboration lives on the main setup page. */
export default async function TripHostSetupOverviewRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id || !isUuid(id)) notFound();
  redirect(`/trip/${id}/setup#sec-collab-sidebar`);
}
