import type { Metadata } from "next";
import { Instrument_Serif, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { ScrollFade } from "@/components/ScrollFade";
import { ChatField } from "@/components/ChatField";
import { GlassFilter } from "@/components/GlassFilter";
import { DevTape } from "@/components/DevTape";

// whitevision type: a light serif for display and numerals, Nunito Sans for small caps labels and controls.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const label = Nunito_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-label", display: "swap" });

export const metadata: Metadata = {
  title: "Athena",
  description: "A growth agent for consumer brands. Athena finds the crowds most likely to love your brand and plans how to win them: where, with whom, and when.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${serif.variable} ${label.variable}`}>
      <body>
        {children}
        <ScrollFade />
        <ChatField />
        <GlassFilter />
        {process.env.NODE_ENV !== "production" && <DevTape />}
      </body>
    </html>
  );
}
