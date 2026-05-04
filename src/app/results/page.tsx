import { redirect } from "next/navigation";

/** Legacy route: results now live on each trip page (`/trip/[id]`). */
export default function ResultsRedirectPage() {
  redirect("/my-trips");
}
