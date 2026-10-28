"use client";

import { useCallback, useEffect, useState } from "react";

// The left sidebar's shared parts: whether it's collapsed (remembered, and the same through onboarding and the team),
// the toggle, and its line icons. ⌘B / Ctrl+B flips it from anywhere.

const RAIL = "athena:team-rail";

export function useRail(): [boolean, () => void] {
  const [rail, setRail] = useState(false);
  useEffect(() => {
    try {
      setRail(localStorage.getItem(RAIL) === "1");
    } catch {
      // Storage unavailable: the sidebar starts open.
    }
  }, []);
  const flip = useCallback(() => {
    setRail((r) => {
      try {
        localStorage.setItem(RAIL, r ? "0" : "1");
      } catch {
        // Storage unavailable: the choice lasts this visit.
      }
      return !r;
    });
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        flip();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [flip]);
  return [rail, flip];
}

const mod = () => (typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+");

export function RailToggle({ rail, onFlip }: { rail: boolean; onFlip: () => void }) {
  const label = rail ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button type="button" className="nav-toggle" aria-expanded={!rail} aria-label={label} title={`${label} (${mod()}B)`} onClick={onFlip}>
      <NavIcon name="panel" />
    </button>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </>
  ),
  athena: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  analyst: <path d="M4 20h16 M7 16v-5 M12 16V6 M17 16v-8" />,
  scout: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  navigator: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  rep: <path d="M4 9.5l1.4-4.5h13.2L20 9.5 M4 9.5a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0 2.7 2.7 0 005.3 0 M5.5 12v8h13v-8 M10 20v-4.5h4V20" />,
  matchmaker: (
    <>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </>
  ),
  promoter: <path d="M4 10v4a1 1 0 001 1h2l6 4V5L7 9H5a1 1 0 00-1 1z M17 9a4 4 0 010 6 M19.5 6.5a7.5 7.5 0 010 11" />,
  executive: <path d="M9 5h10 M9 12h10 M9 19h10 M4 5l1 1 2-2 M4 12l1 1 2-2 M4.5 19h1.5" />,
  link: <path d="M9.5 14.5l5-5 M8 11l-2 2a3.5 3.5 0 005 5l2-2 M16 13l2-2a3.5 3.5 0 00-5-5l-2 2" />,
  share: <path d="M12 15V4 M8 8l4-4 4 4 M6 12v6.5a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5V12" />,
  dashboard: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="4.5" rx="1.5" />
      <rect x="13" y="11" width="7" height="9" rx="1.5" />
      <rect x="4" y="13.5" width="7" height="6.5" rx="1.5" />
    </>
  ),
};

export function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name] ?? PATHS.athena}
    </svg>
  );
}
