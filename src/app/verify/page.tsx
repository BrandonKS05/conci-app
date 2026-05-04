import { redirect } from "next/navigation";

/** Legacy SMS verify URL — join is invite-code + account only. */
export default function VerifyRedirectPage() {
  redirect("/trip-parser?join=1");
}
