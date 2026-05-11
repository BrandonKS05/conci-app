import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

/** Editorial display / headings — Cool Luxury Travel design system (Playfair Display). */
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Conci — Everyone’s Personal “Executive” Assistant",
  description:
    "Conci: everyone’s personal “Executive” assistant for group trips — paste a text, link, or screenshot and turn messy chats into a shareable plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[color:var(--surface)] text-[color:var(--on-surface)] antialiased dark:bg-[#0f0f0f] dark:text-neutral-200">
        {children}
      </body>
    </html>
  );
}
