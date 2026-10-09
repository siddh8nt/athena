"use client";

import dynamic from "next/dynamic";

// The journey reads this browser's saved progress on first render, so it renders on the client only.
export const JourneyPage = dynamic(() => import("./Journey").then((m) => m.Journey), { ssr: false, loading: () => <div className="journey journey-loading" /> });
