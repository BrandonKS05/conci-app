import { SiteShell } from "@/frontend/components/site-shell";
import { SupabaseTestPanel } from "@/frontend/components/supabase-test-panel";

export default function SupabaseTestPage() {
  return (
    <SiteShell title="Verify Supabase is wired up correctly." eyebrow="Supabase test">
      <div className="grid gap-6">
        <SupabaseTestPanel />
      </div>
    </SiteShell>
  );
}

