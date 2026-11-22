import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Footing",
  description: "Checks that each link cited in an AI answer actually says what the sentence claims.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
