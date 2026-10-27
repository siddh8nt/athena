"use client";

import { useCallback, useEffect, useState } from "react";
import { devMode, devPost, saveSnapshot, type DevMode } from "@/components/DevTape";
import type { SnapshotInfo } from "@/lib/dev/tapes";

// The step map: every flow and step of the app, each opening the real app at that point from a recorded snapshot.
// Replay serves the recorded responses, so a step can be clicked through and its code edited with hot reload at no cost.

type Status = { offline: boolean; tapes: Record<string, number>; snapshots: SnapshotInfo[] };
type Step = { label: string; note?: string; find: (s: SnapshotInfo) => boolean; url?: string; fresh?: boolean };
type Flow = { title: string; steps: Step[] };

const SUBS = [
  ["analyst", "Analyst"],
  ["scout", "Scout"],
  ["navigator", "Navigator"],
  ["rep", "Rep"],
  ["matchmaker", "Matchmaker"],
  ["promoter", "Promoter"],
] as const;

const stateOf = (s: SnapshotInfo, id: string) => s.journey?.workflow.find((w) => w.id === id)?.state;

const FLOWS: Flow[] = [
  {
    title: "Onboarding",
    steps: [
      { label: "Site read → merge → source conflicts → brief", note: "Starts fresh and replays the recorded onboarding; type any website.", find: () => false, url: "/plan?new=1", fresh: true },
      { label: "Brief ready", find: (s) => !!s.journey?.brand && !s.journey.analyst },
    ],
  },
  {
    title: "The workflow",
    steps: [
      { label: "Analyst's crowds measured", find: (s) => !!s.journey?.analyst && !s.journey.proposed && !s.journey.goals },
      { label: "Goals proposed", find: (s) => !!s.journey?.proposed && !s.journey.goals },
      { label: "Run order (workflow)", find: (s) => !!s.journey?.workflow.length, url: "/plan" },
      { label: "Paused on a question", find: (s) => !!s.journey?.questions, url: "/plan" },
    ],
  },
  ...SUBS.map(([id, name]) => ({
    title: name,
    steps: [
      { label: "Working", find: (s: SnapshotInfo) => stateOf(s, id) === "running", url: `/plan?agent=${id}` },
      { label: "Waiting on you", find: (s: SnapshotInfo) => stateOf(s, id) === "paused", url: `/plan?agent=${id}` },
      { label: "Done", find: (s: SnapshotInfo) => !!s.journey?.works.includes(id), url: `/plan?agent=${id}` },
    ],
  })),
  {
    title: "The Executive plan",
    steps: [
      { label: "Ready: Start / Later", find: (s) => !!s.journey?.plan && !s.journey.exec, url: "/plan" },
      { label: "Started: contacts and drafts", find: (s) => !!s.journey?.exec, url: "/plan?agent=executive" },
      { label: "Items marked", find: (s) => !!s.journey?.exec && !!s.journey.marks, url: "/plan?agent=executive" },
    ],
  },
];

function setMode(m: DevMode) {
  localStorage.setItem("athena:dev:mode", m);
  sessionStorage.removeItem("athena:dev:count");
  return devPost({ op: "mode", offline: m === "replay" });
}

/** Opens the real app at a step: Replay on, the snapshot's browser state restored, then the step's page. */
async function open(name: string | undefined, url: string) {
  await setMode("replay");
  if (name) {
    const snap = (await (await fetch(`/api/dev?op=snapshot&name=${encodeURIComponent(name)}`)).json()) as { store: Record<string, string> } | null;
    if (snap) {
      for (const k of Object.keys(localStorage)) if (k.startsWith("athena:") && !k.startsWith("athena:dev:")) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(snap.store)) localStorage.setItem(k, v);
    }
  }
  location.href = url;
}

const when = (at: number) => new Date(at).toLocaleString();
const head = { font: "700 12px/1 var(--font-label), sans-serif", letterSpacing: ".08em", textTransform: "uppercase", color: "#59636e", margin: "0 0 8px" } as const;
const btn = (on: boolean) => ({ padding: "6px 12px", borderRadius: 999, border: "1px solid #d0d7de", background: on ? "#1f2328" : "#fff", color: on ? "#fff" : "#1f2328", cursor: "pointer", font: "inherit" }) as const;
const card = (ready: boolean) => ({ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid #d0d7de", background: ready ? "#fff" : "#f6f8fa", color: ready ? "#1f2328" : "#8c959f", cursor: ready ? "pointer" : "default", font: "inherit" }) as const;

export function DevMap() {
  const [st, setSt] = useState<Status>();
  const [mode, setM] = useState<DevMode>("live");
  const load = useCallback(() => void fetch("/api/dev?op=status").then((r) => r.json()).then(setSt), []);
  useEffect(() => {
    setM(devMode());
    load();
  }, [load]);
  const pick = (m: DevMode) => {
    setM(m);
    void setMode(m).then(load);
  };
  const snaps = st?.snapshots ?? [];
  // The latest snapshot that matches a step: the state as it was when that step was last reached.
  const latest = (f: (s: SnapshotInfo) => boolean) => [...snaps].reverse().find(f);
  const tapes = Object.values(st?.tapes ?? {}).reduce((a, b) => a + b, 0);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 16px 80px", font: "14px/1.45 var(--font-label), system-ui, sans-serif", color: "#1f2328" }}>
      <h1 style={{ font: "400 34px/1.1 var(--font-serif), serif", margin: "0 0 4px" }}>Developer mode</h1>
      <p style={{ margin: "0 0 20px", color: "#59636e" }}>
        Dev server only. Recordings and snapshots live in <code>.cache/dev</code> (gitignored). {tapes} recorded responses, {snaps.length} snapshots.
      </p>

      <section style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
        {(["live", "record", "replay"] as const).map((m) => (
          <button key={m} type="button" onClick={() => pick(m)} style={btn(mode === m)}>
            {m === "live" ? "Live (real calls)" : m === "record" ? "Record (real calls, saved)" : "Replay (no calls)"}
          </button>
        ))}
        <button type="button" onClick={() => void saveSnapshot("Saved from /dev").then(load)} style={btn(false)}>
          Save snapshot of current state
        </button>
        <span style={{ color: "#59636e" }}>Server: {st?.offline ? "offline (fixtures, no Gemini)" : "live"}</span>
      </section>

      {FLOWS.map((f) => (
        <section key={f.title} style={{ marginBottom: 18 }}>
          <h2 style={head}>{f.title}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {f.steps.map((s) => {
              const snap = s.fresh ? undefined : latest(s.find);
              const ready = !!snap || !!s.fresh;
              return (
                <button key={s.label} type="button" disabled={!ready} onClick={() => void open(snap?.name, s.url ?? snap?.url ?? "/plan")} style={card(ready)}>
                  <strong style={{ display: "block" }}>{s.label}</strong>
                  <span style={{ color: "#59636e", fontSize: 12 }}>{s.note ?? (snap ? `${snap.journey?.brand ?? ""} · ${when(snap.at)}` : "Not recorded yet")}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section style={{ marginTop: 28 }}>
        <h2 style={head}>Every snapshot</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {[...snaps].reverse().map((s) => (
            <li key={s.name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid #e6e8eb" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.auto ? "" : "★ "}
                {s.label} <span style={{ color: "#59636e" }}>· {s.url} · {when(s.at)}</span>
              </span>
              <button type="button" onClick={() => void open(s.name, s.url)} style={btn(false)}>
                Open
              </button>
              <button type="button" onClick={() => void devPost({ op: "delete", name: s.name }).then(load)} style={btn(false)}>
                Delete
              </button>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
