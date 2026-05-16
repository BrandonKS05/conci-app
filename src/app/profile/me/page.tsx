import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/backend/supabase/auth-server";

export const dynamic = "force-dynamic";

/** Redirects the Profile nav tab to the signed-in user's public profile. */
export default async function MyProfileRedirectPage() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth?next=/profile/me");
  }

  redirect(`/profile/${user.id}`);
}
