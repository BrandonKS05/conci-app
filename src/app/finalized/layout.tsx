import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cancun Getaway — Demo itinerary | Conci",
  description: "Hardcoded demo finalized trip itinerary (direct link only).",
  robots: { index: false, follow: false },
};

export default function FinalizedDemoLayout({ children }: { children: ReactNode }) {
  return children;
}
