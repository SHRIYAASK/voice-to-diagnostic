import type { Metadata } from "next";
import { Barlow, Barlow_Semi_Condensed, Noto_Sans_Devanagari, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});
const tamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-tamil",
  display: "swap",
});

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
      className={`${barlow.variable} ${barlowCondensed.variable} ${devanagari.variable} ${tamil.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
