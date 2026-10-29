import { ImageResponse } from "next/og";

// The link preview for every page (Open Graph and X): the landing hero in miniature, dark in both modes like the hero.
// Built once at build time, in the default font, so it needs nothing from the network.

export const alt = "Athena: the taste-led growth agent for consumer brands";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px",
          background: "#14120f", color: "#f3efe6",
          backgroundImage: "radial-gradient(circle at 86% 14%, rgba(217, 164, 65, 0.28), rgba(126, 43, 52, 0.12) 32%, rgba(20, 18, 15, 0) 58%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 26, height: 26, borderRadius: 13, background: "#7e2b34" }} />
          <div style={{ width: 26, height: 26, borderRadius: 13, background: "#a9791c", marginLeft: -8 }} />
          <div style={{ fontSize: 40, marginLeft: 8, letterSpacing: -0.5 }}>Athena</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#d9a441" }}>
            The taste-led growth agent for consumer brands
          </div>
          <div style={{ fontSize: 104, lineHeight: 1, letterSpacing: -3 }}>Stop selling to everyone.</div>
          <div style={{ fontSize: 30, lineHeight: 1.4, color: "#c2baab", maxWidth: 900 }}>
            It finds the crowds already wired to love your brand, then puts you in their path.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
