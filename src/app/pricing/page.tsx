import type { Metadata } from "next";
import { PricingPageWithSuspense } from "@/frontend/components/pricing-page";

export const metadata: Metadata = {
  title: "Pricing — Conci",
  description: "Free, Host, and Host Pro plans for group trip planning.",
};

export default function PricingRoute() {
  return <PricingPageWithSuspense />;
}
