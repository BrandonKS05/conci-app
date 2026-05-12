import { notFound } from "next/navigation";
import { SiteShell } from "@/frontend/components/site-shell";
import { SupabaseTestPanel } from "@/frontend/components/supabase-test-panel";

export const metadata = {
  robots: { index: false, follow: false },
};

export default function SupabaseTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <SiteShell title="Verify Supabase is wired up correctly." eyebrow="Supabase test">
      <div className="grid gap-6">
        <SupabaseTestPanel />
      </div>
    </SiteShell>
  );
}

