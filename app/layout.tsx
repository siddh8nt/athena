import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Athena: the taste-led growth agent for consumer startups",
  description: "Plans your growth from 1 to n: where to grow, which venues, who to partner with, what to say and when to show up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
