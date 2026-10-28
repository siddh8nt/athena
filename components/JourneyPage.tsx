"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// The journey reads this browser's saved progress on first render, so it renders on the client only. Until it arrives
// the page shows its own shape at once (PRD §23.7 e): the top bar, then one frosted sheet with a title, tabs and quiet
// cards. No spinner and no words.
export function JourneyShape() {
  return (
    <div className="journey journey-loading" aria-busy="true">
      <header className="topbar journey-top">
        <Link href="/" className="wordmark-link">
          <strong>Athena</strong>
        </Link>
      </header>
      <main className="journey-shape-main">
        <div className="dash-page journey-shape">
          <span className="shape-bar shape-title" />
          <div className="shape-tabs">
            <span className="shape-bar" />
            <span className="shape-bar" />
            <span className="shape-bar" />
            <span className="shape-bar" />
          </div>
          <div className="shape-cards">
            <span className="shape-card" />
            <span className="shape-card" />
            <span className="shape-card" />
          </div>
        </div>
      </main>
    </div>
  );
}

export const JourneyPage = dynamic(() => import("./Journey").then((m) => m.Journey), { ssr: false, loading: JourneyShape });
