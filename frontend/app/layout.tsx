import type { Metadata } from "next";
import "./globals.css";

// Fonts are loaded by the browser at runtime (not downloaded during `next build`), so a Google Fonts
// hiccup on the build server can never fail a deploy.
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap";

const fontVars = {
  "--font-barlow": "'Barlow'",
  "--font-barlow-condensed": "'Barlow Semi Condensed'",
  "--font-devanagari": "'Noto Sans Devanagari'",
  "--font-tamil": "'Noto Sans Tamil'",
} as React.CSSProperties;

export const metadata: Metadata = {
  title: "ApplianceCare AI | Smart Appliance Diagnostics & Troubleshooting",
  description:
    "Diagnose smarter. Troubleshoot confidently. Get the right support across Air Conditioners, Refrigerators, Washing Machines, Microwaves, and Dishwashers.",
  keywords: "ApplianceCare AI, appliance diagnostics, troubleshooting, error codes, service repair, air conditioner, refrigerator, washing machine, microwave, dishwasher",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={fontVars}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body className="min-h-screen bg-paper" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
