import type { ReactNode } from "react";

/** Fonts load in root `layout.tsx`; this segment layout is a no-op. */
export default function TripParserLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
