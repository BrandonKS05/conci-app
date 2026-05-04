import { redirect } from "next/navigation";

/** Legacy `/join` — join UI lives on Create a Trip (`/trip-parser`) under the AI parser. */
export default function JoinRedirectPage() {
  redirect("/trip-parser?join=1");
}
