"use client";

export type TryKey = "compare" | "evidence" | "message" | "moments" | "switch";

export const TRY_ITEMS: { key: TryKey; label: string; moment: string }[] = [
  { key: "compare", label: "Flip Without Qloo on Places", moment: "M3" },
  { key: "evidence", label: "Open a pick's evidence", moment: "M4" },
  { key: "message", label: "See your crowd's message", moment: "M6" },
  { key: "moments", label: "Find a moment", moment: "M7" },
  { key: "switch", label: "Switch brand", moment: "M9" },
];

/** The "Try this" card (§2.4): five items pointing at real buttons; ticks as they're done; never presses anything. */
export function TryThis({
  done,
  active,
  open,
  onPick,
  onToggle,
  onOwnBrand,
}: {
  done: Set<TryKey>;
  active: TryKey | null;
  open: boolean;
  onPick: (k: TryKey) => void;
  onToggle: () => void;
  onOwnBrand: () => void;
}) {
  if (!open)
    return (
      <button className="try-chip" onClick={onToggle} aria-label="Open the Try this guide">
        Try this · {done.size}/5
      </button>
    );
  return (
    <aside className="try" aria-label="Try this">
      <header>
        <strong>Try this</strong>
        <button onClick={onToggle} aria-label="Collapse the guide">–</button>
      </header>
      <ol>
        {TRY_ITEMS.map((it) => (
          <li key={it.key} className={`${done.has(it.key) ? "done" : ""} ${active === it.key ? "active" : ""}`}>
            <button onClick={() => onPick(it.key)}>
              <span className="tick" aria-hidden>{done.has(it.key) ? "✓" : "○"}</span> {it.label}
            </button>
          </li>
        ))}
      </ol>
      <button className="linkish" onClick={onOwnBrand}>Then try your own brand →</button>
    </aside>
  );
}
