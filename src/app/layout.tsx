import type { Metadata } from "next";
import { Besley, Schibsted_Grotesk, Courier_Prime } from "next/font/google";
import "./globals.css";

const display = Besley({ subsets: ["latin"], weight: ["600", "900"], variable: "--font-display" });
const body = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-body" });
const data = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-data" });

const description =
  "Checks that each link cited in an AI answer actually says what the sentence claims. Gemini Nano triages on your laptop; the cloud decides the hard calls; code checks every quote.";
const ogImage = { url: "/og-image.png", width: 2400, height: 1260, alt: "Footing — a cited sentence circled in red pencil beside the source line that doesn't say it" };

export const metadata: Metadata = {
  metadataBase: new URL("https://footing.edycu.dev"),
  title: "Footing — does the source say what the sentence claims?",
  description,
  icons: { icon: "/icon.svg" },
  openGraph: { type: "website", siteName: "Footing", url: "/", title: "Footing — somebody finally reads the sources", description, images: [ogImage] },
  twitter: { card: "summary_large_image", title: "Footing — somebody finally reads the sources", description, images: [ogImage] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
