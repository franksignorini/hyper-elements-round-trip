import type { Metadata } from "next";
import { Bodoni_Moda, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});
// Bodoni: a letterpress-era face for the italic accents, in keeping with the print-press idea.
const serif = Bodoni_Moda({ variable: "--font-serif", subsets: ["latin"], style: ["italic"], axes: ["opsz"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  // Absolute URLs for the share card. The Pages workflow sets NEXT_PUBLIC_SITE_URL to the site's origin.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://hyper-elements-round-trip.vercel.app"),
  twitter: { card: "summary_large_image" },
  title: "Round Trip: one email template, in code and in the builder",
  description:
    "A Hyper Elements newsletter template that lives in JSX and in Unlayer's visual builder at once. Builder edits come back as a git diff; code edits flow into the builder.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}
