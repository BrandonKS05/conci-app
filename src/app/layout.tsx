import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { ThemeProvider } from "@/frontend/components/theme-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

/** Editorial display / headings — matches Create a Trip greeting (Instrument Serif). */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Conci",
  description: "A consumer-friendly AI executive assistant MVP.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
