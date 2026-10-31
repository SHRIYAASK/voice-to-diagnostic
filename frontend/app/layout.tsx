import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApplianceCare AI | Smart Appliance Diagnostics & Troubleshooting",
  description:
    "Diagnose smarter. Troubleshoot confidently. Get the right support across Air Conditioners, Refrigerators, Washing Machines, Microwaves, and Dishwashers.",
  keywords: "ApplianceCare AI, appliance diagnostics, troubleshooting, error codes, service repair, air conditioner, refrigerator, washing machine, microwave, dishwasher",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
