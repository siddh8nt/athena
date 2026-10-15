import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Athena",
  description: "A growth agent for consumer brands. Athena finds the crowds most likely to love your brand and plans how to win them: where, with whom, and when.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
