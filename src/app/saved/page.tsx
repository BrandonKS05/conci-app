import { redirect } from "next/navigation";

/** @deprecated Use `/my-trips` (host) and `/joined-trips` (member). */
export default function SavedPageRedirect() {
  redirect("/my-trips");
}
