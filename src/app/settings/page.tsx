import type { Metadata } from "next";
import { SettingsPageClient } from "@/frontend/components/settings-page";

export const metadata: Metadata = {
  title: "Settings — Conci",
  description: "Account, subscription, and notification preferences.",
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
