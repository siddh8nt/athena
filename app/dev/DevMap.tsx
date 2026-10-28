"use client";

import { useCallback, useEffect, useState } from "react";
import { devMode, devPost, saveSnapshot, setThen, type DevMode } from "@/components/DevTape";
import type { SnapshotInfo } from "@/lib/dev/tapes";
import { PACKS } from "@/lib/journey/packs";
import { DEMO_BRANDS } from "@/lib/playbook/demo";

// The step map: every flow and step of the app, each opening the real app at that point from a recorded snapshot.
// Replay serves the recorded responses, so a step can be clicked through and its code edited with hot reload at no cost.
// A run picks whose snapshots the cards open: a step that run never reached opens the newest other run that did.

type Status = { offline: boolean; tapes: Record<string, number>; snapshots: SnapshotInfo[] };
/** A card: the snapshot it opens (the latest that `find` matches), the page, and `then`, the clicks after the page
 *  loads for a feature behind a click (see setThen). `fresh`: no snapshot, the page as a new visitor sees it. */
type Step = { label: string; note?: string; find: (s: SnapshotInfo) => boolean; url?: string; fresh?: boolean; then?: string[] };
type Flow = { title: string; note?: string; steps: Step[] };

const SUBS = [
  ["scout", "Scout"],
  ["navigator", "Navigator"],
  ["rep", "Rep"],
  ["matchmaker", "Matchmaker"],
  ["promoter", "Promoter"],
] as const;

const stateOf = (s: SnapshotInfo, id: string) => s.journey?.workflow.find((w) => w.id === id)?.state;
const none = () => false;
/** The richest state for pages that show everything so far: Athena's plan in, else any workflow. */
const full = (s: SnapshotInfo) => !!s.journey?.plan;
const done = (id: string) => (s: SnapshotInfo) => !!s.journey?.works.includes(id);

const FLOWS: Flow[] = [
  {
    title: "Pages",
    note: "As a new visitor sees them: no snapshot. Every page follows the system's light or dark setting; switch it to check both.",
    steps: [
      { label: "Landing page", find: none, url: "/", fresh: true },
      { label: "/plan while it loads", note: "The page's own shape before the journey arrives, held still.", find: none, url: "/dev/shape", fresh: true },
      ...PACKS.map((p) => ({ label: `Sample brand: ${p.name}`, note: "Starts fresh with its first message; replays a recorded run where there is one.", find: none, url: `/plan?pack=${p.slug}`, fresh: true })),
      ...DEMO_BRANDS.map((b) => ({ label: `Demo workspace: ${b.name}`, note: `The older precomputed workspace at /${b.slug}.`, find: none, url: `/${b.slug}`, fresh: true })),
    ],
  },
  {
    title: "Onboarding",
    steps: [
      { label: "Site read → merge → source conflicts → brief", note: "Starts fresh and replays the recorded onboarding; type any website.", find: none, url: "/plan?new=1", fresh: true },
      { label: "Brief ready, Analyst measuring", find: (s) => !!s.journey?.brand && !s.journey.analyst && !s.journey.goals, url: "/plan" },
      { label: "Onboarding record (conflicts settled)", note: "In Athena's chat: the record card with the conflicts the founder settled.", find: (s) => !!s.journey?.settled, url: "/plan?agent=athena" },
    ],
  },
  {
    title: "Goals and the workflow",
    steps: [
      { label: "Goals proposed", find: (s) => !!s.journey?.proposed && !s.journey.goals, url: "/plan" },
      { label: "Workflow running", find: (s) => !!s.journey?.workflow.some((w) => w.state === "running"), url: "/plan" },
      { label: "Paused on a question", find: (s) => !!s.journey?.questions, url: "/plan" },
      { label: "Athena's plan in", find: full, url: "/plan" },
    ],
  },
  {
    title: "Dashboard",
    steps: [
      { label: "Overview", find: full, url: "/plan?tab=overview" },
      { label: "Brand Knowledge Base", find: full, url: "/plan?tab=knowledge" },
      { label: "Brand Graph: a theme open", find: full, url: "/plan?tab=knowledge", then: ['[aria-label^="Theme:"]'] },
      { label: "Brand Graph: expanded", find: full, url: "/plan?tab=knowledge", then: [".bg-expand"] },
      { label: "Your answers", find: full, url: "/plan?tab=answers" },
      { label: "What's working", find: (s) => !!s.journey?.marks, url: "/plan?tab=working" },
      { label: "What's working: nothing yet", note: "Nothing marked and no orders file: one line on what will fill it.", find: (s) => full(s) && !s.journey?.marks && !s.journey?.sales, url: "/plan?tab=working" },
      { label: "Execute Plan tab", find: (s) => !!s.journey?.exec, url: "/plan?tab=executive" },
      { label: "Chat drawer open", find: full, url: "/plan", then: ["button::Chat with Athena"] },
      { label: "This week", note: "At the top of Overview: pitches waiting, what falls due, the next events.", find: (s) => !!s.journey?.exec, url: "/plan?tab=overview" },
      { label: "What's working: sales from an orders file", note: "The made-up sample file, labelled Sample data.", find: (s) => !!s.journey?.sales, url: "/plan?tab=working" },
    ],
  },
  {
    title: "Connect with Athena MCP and Share your plan",
    steps: [
      { label: "Connect with Athena MCP, before the plan", note: "Share your plan isn't in the sidebar yet; the panel says the plan joins when it's written.", find: (s) => !!s.journey?.goals && !s.journey.plan, url: "/plan", then: [".nav-mcp"] },
      { label: "Connect with Athena MCP", find: full, url: "/plan", then: [".nav-mcp"] },
      { label: "Connect: as a file", find: full, url: "/plan", then: [".nav-mcp", "#mcp-file h3"] },
      { label: "Share your plan", find: full, url: "/plan", then: [".nav-share"] },
      { label: "Share: calendar", find: full, url: "/plan", then: [".nav-share", "#mcp-calendar h3"] },
      { label: "Share: with your team", find: full, url: "/plan", then: [".nav-share", "#mcp-share h3"] },
      { label: "Demo link on the first screen", note: "Try the Athena MCP server on a sample plan: both panels behind one switch, with the Monday email.", find: none, url: "/plan?new=1", fresh: true, then: [".ob-mcp button"] },
      { label: "Team share page", note: "The demo's view-only Execute Plan.", find: none, url: "/share/fishwife-sample-plan", fresh: true },
      { label: "Share link replaced", find: none, url: "/share/replaced-link", fresh: true },
    ],
  },
  {
    title: "Athena",
    steps: [
      { label: "Athena's tab: chat and panel", find: full, url: "/plan?agent=athena" },
      { label: "Panel collapsed to its rail", find: full, url: "/plan?agent=athena", then: [".agent-panel-hide"] },
    ],
  },
  {
    title: "Analyst",
    steps: [
      { label: "Working", find: (s) => stateOf(s, "analyst") === "running" || (!!s.journey?.goals && !s.journey.analyst), url: "/plan?agent=analyst" },
      { label: "Done: Taste Galaxy and fits", find: (s) => !!s.journey?.analyst, url: "/plan?agent=analyst" },
      { label: "Taste Galaxy as a list", find: (s) => !!s.journey?.analyst, url: "/plan?agent=analyst", then: ["button::Show as a list"] },
    ],
  },
  ...SUBS.map(([id, name]) => ({
    title: name,
    steps: [
      { label: "Working", find: (s: SnapshotInfo) => stateOf(s, id) === "running", url: `/plan?agent=${id}` },
      { label: "Waiting on you", find: (s: SnapshotInfo) => stateOf(s, id) === "paused", url: `/plan?agent=${id}` },
      { label: "Done: its crowd tabs", find: done(id), url: `/plan?agent=${id}` },
      { label: "Across all three", find: done(id), url: `/plan?agent=${id}`, then: [".crowd-tabs [role=tab]::Across all three"] },
      { label: "A name's sheet", find: done(id), url: `/plan?agent=${id}`, then: [".crowd-chip"] },
    ],
  })),
  {
    title: "Names and sources",
    note: "§23.8: crowds named after two things they love, a card behind every known name, and sources named instead of numbered. The share page needs no snapshot; narrow the window below 640px to see a card as a bottom sheet.",
    steps: [
      { label: "Crowd card: named after two loves", note: "Its handle, and what they share as Athena's read in the dashed outline.", find: (s) => !!s.journey?.analyst, url: "/plan?agent=analyst" },
      { label: "Name card: a crowd", find: none, url: "/share/fishwife-sample-plan", fresh: true, then: [".ref-link[data-kind=crowd]"] },
      { label: "Name card: a shop", find: done("rep"), url: "/plan?agent=rep", then: [".ref-link[data-kind=shop]"] },
      { label: "Name card: a city", find: done("navigator"), url: "/plan?agent=navigator", then: [".ref-link[data-kind=city]"] },
      { label: "Name card: a creator, partner or podcast", find: done("matchmaker"), url: "/plan?agent=matchmaker", then: [".ref-link[data-kind=creator], .ref-link[data-kind=partner], .ref-link[data-kind=podcast]"] },
      { label: "Name card: an event", find: done("promoter"), url: "/plan?agent=promoter", then: [".ref-link[data-kind=event]"] },
      { label: "Name card: from the Brand Graph", note: "A brand like yours, a rival or a shop that stocks you, in Athena's chat.", find: full, url: "/plan?agent=athena", then: [".ref-link[data-kind=brand], .ref-link[data-kind=rival], .ref-link[data-kind=shop]"] },
      { label: "Source chip: a subagent's sentence", find: done("scout"), url: "/plan?agent=scout", then: [".src-chip"] },
    ],
  },
  {
    title: "Execute Plan",
    steps: [
      { label: "Ready: Start / Later card", find: (s) => !!s.journey?.plan && !s.journey.exec, url: "/plan" },
      { label: "Left for later", find: (s) => !!s.journey?.later, url: "/plan?agent=executive" },
      { label: "Left out: the brand-fit check", note: "Opened at the end of the list: each one's reason and Bring it back.", find: (s) => !!s.journey?.plan && !!s.journey.leftOut, url: "/plan?agent=executive", then: [".xp-leftout summary"] },
      { label: "Running: rows, contacts and drafts", find: (s) => !!s.journey?.exec, url: "/plan?agent=executive" },
      { label: "A row open: its email", find: (s) => !!s.journey?.exec, url: "/plan?agent=executive", then: [".xp-row-head:has(.xp-icons)"] },
      { label: "A row's DM", find: (s) => !!s.journey?.exec, url: "/plan?agent=executive", then: [".xp-row-head:has(.xp-icons)", ".xp-draft-kind [role=tab]::DM"] },
      { label: "A row's call or walk-in script", find: (s) => !!s.journey?.exec, url: "/plan?agent=executive", then: [".xp-row-head:has(.xp-icons)", ".xp-draft-kind [role=tab]:last-child"] },
      { label: "Results tab", find: (s) => !!s.journey?.exec, url: "/plan?agent=executive", then: [".xp-tabs [role=tab]::Results"] },
      { label: "Mid-run question cards", note: "Phone-only shops, two profiles: cards in the chat.", find: (s) => !!s.journey?.asked, url: "/plan?agent=executive" },
      { label: "Profiles to choose from", find: (s) => !!s.journey?.profiles, url: "/plan?agent=executive" },
      { label: "Did these go out?", find: (s) => !!s.journey?.opened, url: "/plan?agent=executive" },
      { label: "Follow-up wait set", find: (s) => !!s.journey?.wait, url: "/plan?agent=executive" },
      { label: "Items marked", find: (s) => !!s.journey?.exec && !!s.journey.marks, url: "/plan?agent=executive" },
    ],
  },
];

function setMode(m: DevMode) {
  localStorage.setItem("athena:dev:mode", m);
  sessionStorage.removeItem("athena:dev:count");
  return devPost({ op: "mode", offline: m === "replay" });
}

/** Opens the real app at a step: Replay on, the snapshot's browser state restored, then the step's page and clicks. */
async function open(name: string | undefined, url: string, then?: string[]) {
  setThen(then);
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
const RUN = "athena:dev:run";
const head = { font: "700 12px/1 var(--font-label), sans-serif", letterSpacing: ".08em", textTransform: "uppercase", color: "#59636e", margin: "0 0 8px" } as const;
const btn = (on: boolean) => ({ padding: "6px 12px", borderRadius: 999, border: "1px solid #d0d7de", background: on ? "#1f2328" : "#fff", color: on ? "#fff" : "#1f2328", cursor: "pointer", font: "inherit" }) as const;
const card = (ready: boolean) => ({ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid #d0d7de", background: ready ? "#fff" : "#f6f8fa", color: ready ? "#1f2328" : "#8c959f", cursor: ready ? "pointer" : "default", font: "inherit" }) as const;

export function DevMap() {
  const [st, setSt] = useState<Status>();
  const [mode, setM] = useState<DevMode>("live");
  const [run, setRunState] = useState<string | null>(null);
  const load = useCallback(() => void fetch("/api/dev?op=status").then((r) => r.json()).then(setSt), []);
  useEffect(() => {
    setM(devMode());
    try {
      setRunState(localStorage.getItem(RUN));
    } catch {}
    load();
  }, [load]);
  const pick = (m: DevMode) => {
    setM(m);
    void setMode(m).then(load);
  };
  const snaps = st?.snapshots ?? [];
  // Each brand's run, newest first; the picked one (by default the newest) is the one the cards open.
  const runs = [...new Map(snaps.flatMap((s) => (s.journey?.brand ? [[s.journey.brand, s.at] as const] : []))).entries()].sort((a, b) => b[1] - a[1]);
  const picked = run === "" ? "" : run && runs.some(([b]) => b === run) ? run : (runs[0]?.[0] ?? "");
  const pickRun = (b: string) => {
    setRunState(b);
    try {
      localStorage.setItem(RUN, b);
    } catch {}
  };
  // The latest snapshot that matches a step in the picked run, else in any run: the state as it was when last reached.
  const latest = (f: (s: SnapshotInfo) => boolean) => {
    const all = [...snaps].reverse().filter(f);
    return (picked && all.find((s) => s.journey?.brand === picked)) || all[0];
  };
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

      <section style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <span style={head}>Run</span>
        {runs.map(([b, at]) => (
          <button key={b} type="button" onClick={() => pickRun(b)} style={btn(picked === b)}>
            {b} · {new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </button>
        ))}
        <button type="button" onClick={() => pickRun("")} style={btn(picked === "")}>
          Newest of each step
        </button>
      </section>

      {FLOWS.map((f) => (
        <section key={f.title} style={{ marginBottom: 18 }}>
          <h2 style={head}>{f.title}</h2>
          {f.note && <p style={{ margin: "-4px 0 8px", color: "#59636e", fontSize: 12 }}>{f.note}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {f.steps.map((s) => {
              const snap = s.fresh ? undefined : latest(s.find);
              const ready = !!snap || !!s.fresh;
              return (
                <button key={s.label} type="button" disabled={!ready} onClick={() => void open(snap?.name, s.url ?? snap?.url ?? "/plan", s.then)} style={card(ready)}>
                  <strong style={{ display: "block" }}>{s.label}</strong>
                  <span style={{ display: "block", color: "#59636e", fontSize: 12 }}>{s.fresh ? (s.note ?? "Opens fresh") : snap ? `${snap.journey?.brand ?? ""} · ${when(snap.at)}` : "Not recorded yet"}</span>
                  {snap && picked && snap.journey?.brand !== picked && <span style={{ display: "block", color: "#9a6700", fontSize: 12 }}>Not reached in {picked}&apos;s run</span>}
                  {!s.fresh && s.note && <span style={{ display: "block", color: "#8c959f", fontSize: 12 }}>{s.note}</span>}
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
