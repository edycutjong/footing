import type { Metadata } from "next";
import { Besley, Schibsted_Grotesk, Courier_Prime } from "next/font/google";
import "./globals.css";

const display = Besley({ subsets: ["latin"], weight: ["600", "900"], variable: "--font-display" });
const body = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-body" });
const data = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-data" });

export const metadata: Metadata = {
  title: "Footing — does the source say what the sentence claims?",
  description: "Checks that each link cited in an AI answer actually says what the sentence claims. Gemini Nano triages on your laptop; the cloud decides the hard calls; code checks every quote.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
