"use client";

import { useEffect, useState } from "react";
import { installPause, type Pause } from "@/lib/pause";

// The developer's play/pause (dev server only; the layout leaves it out of production builds). One button on every
// page, bottom left just above Next's own dev badge, clear of the chat's Send at bottom right: pause holds the whole
// run in place, play carries on from there (lib/pause.ts).

const w = () => window as Window & { __athenaPause?: Pause };

function pauseControl(): Pause {
  return (w().__athenaPause ??= installPause(window, (url) => new URL(url, location.href).pathname.startsWith("/api/")));
}

// While paused, CSS animations stop too, all but the button's own.
const CSS = `
html[data-dev-paused] *:not(.dev-pause), html[data-dev-paused] *::before, html[data-dev-paused] *::after { animation-play-state: paused !important; }
.dev-pause { position: fixed; left: 20px; bottom: 64px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); font-family: var(--font-caps, var(--font-label)), sans-serif; font-weight: 700; font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; box-shadow: var(--overlay, 0 8px 24px rgba(0, 0, 0, 0.2)); cursor: pointer; opacity: 0.55; transition: opacity 120ms ease; }
.dev-pause:hover, .dev-pause:focus-visible, .dev-pause[aria-pressed="true"] { opacity: 1; }
.dev-pause[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.dev-pause svg { width: 12px; height: 12px; fill: currentColor; }
`;

export function DevPause() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const p = pauseControl();
    setPaused(p.paused);
    return p.subscribe((on) => {
      setPaused(on);
      if (on) document.documentElement.dataset.devPaused = "";
      else delete document.documentElement.dataset.devPaused;
    });
  }, []);

  const toggle = () => {
    const p = pauseControl();
    if (p.paused) p.play();
    else p.pause();
  };

  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="dev-pause" aria-pressed={paused} onClick={toggle} title={paused ? "Play: carry on the run" : "Pause the run"}>
        {paused ? (
          <svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 1.5v9l8-4.5z" /></svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" /></svg>
        )}
        {paused ? "Paused" : "Pause"}
      </button>
    </>
  );
}
