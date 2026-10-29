import type { Metadata } from "next";
import { Instrument_Serif, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { ScrollFade } from "@/components/ScrollFade";
import { ChatField } from "@/components/ChatField";
import { GlassFilter } from "@/components/GlassFilter";
import { DevPause } from "@/components/DevPause";

// whitevision type: a light serif for display and numerals, Nunito Sans for small caps labels and controls.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const label = Nunito_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-label", display: "swap" });

export const metadata: Metadata = {
  title: "Athena",
  description: "A growth agent for consumer brands. Athena finds the crowds most likely to love your brand and plans how to win them: where, with whom, and when.",
};

// Dark unless the founder switched to light (§23.9 a), set before first paint so a page never flashes the other theme.
const THEME = `try{document.documentElement.dataset.theme=localStorage.getItem("athena:theme")==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${label.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>
        {children}
        <ScrollFade />
        <ChatField />
        <GlassFilter />
        {process.env.NODE_ENV !== "production" && <DevPause />}
      </body>
    </html>
  );
}
