"use client";

import type { SpineGo, Stage } from "@/lib/journey/spine";

/**
 * The journey's spine (§23.9 e): Your brand → Who loves you → Your goals → The team's work → Your plan → Execute.
 * In full on the dashboard; `compact` in the top bar, where only the current stage keeps its words. The current stage
 * says what's happening or what's needed, and its click goes there.
 */
export function Spine({ stages, onGo, compact }: { stages: Stage[]; onGo: (to: SpineGo) => void; compact?: boolean }) {
  const now = stages.find((s) => s.state === "now");
  return (
    <nav className={`spine${compact ? " spine-compact" : ""}`} aria-label="Where your plan is">
      <ol>
        {stages.map((s, i) => {
          const body = (
            <>
              <span className="spine-mark" aria-hidden>
                {s.state === "done" ? (
                  <svg width="9" height="9" viewBox="0 0 12 12">
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="spine-text">
                <span className="spine-label">{s.label}</span>
                {s.line && <span className={`spine-line${s.you ? " spine-you" : ""}`}>{s.line}</span>}
              </span>
            </>
          );
          const cls = `spine-stage spine-${s.state}${s.you ? " spine-needs" : ""}`;
          return (
            <li key={s.id} className={cls} aria-current={s === now ? "step" : undefined}>
              {s.go ? (
                <button type="button" onClick={() => onGo(s.go!)} title={s.line ? `${s.label}: ${s.line}` : s.label}>
                  {body}
                </button>
              ) : (
                <span className="spine-static">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
