"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ACCEPT, TrailView, Understood, useBriefChat, type Msg } from "./chat";
import { usePlan, type PlanSource } from "./usePlan";
import { MarketsView, MessageView, MomentsView, PartnersView, PlacesView } from "./Blocks";
import { Workspace } from "./Workspace";
import { Galaxy } from "./Galaxy";
import { CrowdGeography } from "./CrowdGeography";
import { BenchNote, WithWithout, type AloneRequest } from "./WithWithout";
import { TasteAxes, useLean, type Taste } from "./TasteAxes";
import { ShowWhy } from "./WhyPath";
import type { Contribution } from "@/lib/qloo/types";
import { GUESS, type Turn } from "@/lib/brief/conversation";
import { briefToInput } from "@/lib/brief/to-input";
import type { BrandBrief } from "@/lib/brief/types";
import { GROWTH, MAX_PICKS, STOP_LABELS, blockedReason, decisionsFor, labelFor, motionsFor, orderFor, spreadNote, stopsFor, suggest, type Channel, type GrowthType, type StopId } from "@/lib/journey/growth";
import { crowdIdForStop, crowdSignal } from "@/lib/journey/weights";
import type { PlaceOption, Resolution } from "@/lib/places/resolve";
import { emptyJourney, type CrowdCard, type CrowdsEvent, type CrowdsResult, type Journey as JourneyState, type Pin, type Reaction } from "@/lib/journey/types";
import type { Galaxy as GalaxyData } from "@/lib/taste/galaxy";
import { packBySlug } from "@/lib/journey/packs";
import { takeFor } from "@/lib/journey/takes";
import type { Block } from "@/lib/playbook/config";
import type { MarketsData } from "@/lib/blocks/markets";
import type { PlacesData } from "@/lib/blocks/places";
import type { PartnersData } from "@/lib/blocks/partners";
import type { MessageData } from "@/lib/blocks/message";
import type { MomentsData } from "@/lib/blocks/moments";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), { ssr: false, loading: () => <div className="map map-loading" /> });

// The journey (PRD §6.2, §13.1–13.2): the conversation leads on the left, each stop lands as a card on the canvas on
// the right, and the progress rail on top shows the stops this founder's growth types chose. Step by step: every stop
// waits for the founder's choice. State lives in this browser only (a convenience; nothing is lost if it's cleared).

const STORE = "athena:journey:v1";
type Saved = { brief: BrandBrief; msgs: Msg[]; turn: Turn; journey: JourneyState };

/** `?pack=<slug>` starts a sample brand and `?new=1` starts fresh; either way, the URL is cleaned so a reload resumes. */
let entered: { fresh: boolean; message: string } | undefined;
function entry(): { fresh: boolean; message: string } {
  // Read once per page load: React may run state initialisers twice, and the URL is cleaned right after.
  return (entered ??= readEntry());
}
function readEntry(): { fresh: boolean; message: string } {
  try {
    const q = new URLSearchParams(window.location.search);
    const pack = packBySlug(q.get("pack"));
    const fresh = !!pack || q.get("new") === "1";
    if (fresh) localStorage.removeItem(STORE);
    return { fresh, message: pack?.message ?? "" };
  } catch {
    return { fresh: false, message: "" };
  }
}

function load(): Saved | undefined {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null;
    return s?.brief && s.msgs?.length && s.journey ? s : undefined;
  } catch {
    return undefined;
  }
}

/** Stops whose results depend on the chosen city; the others ignore it, so a city change doesn't re-run them. */
const CITY_STOPS = new Set<StopId>(["where", "places", "moments"]);
/** Stops that can't start before a city is chosen (Where is where it gets chosen). */
const NEEDS_CITY = new Set<StopId>(["places", "moments"]);

/** The blocks a stop runs on the plan engine. */
const BLOCK_OF: Partial<Record<StopId, Block>> = { where: "markets", places: "places", partners: "partners", message: "message", moments: "moments" };

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function Journey() {
  const [start] = useState(entry);
  // Clean the URL after render (changing it during render upsets Next's router), so a reload resumes.
  useEffect(() => {
    if (start.fresh) window.history.replaceState(null, "", "/plan");
  }, [start.fresh]);
  const [saved] = useState(() => (start.fresh ? undefined : load()));
  const chat = useBriefChat(saved);
  const { brief, msgs, setMsgs, turn, busy, live, queued, first } = chat;
  const [j, setJ] = useState<JourneyState>(saved?.journey ?? emptyJourney());
  const [text, setText] = useState(start.message);
  const [drag, setDrag] = useState(false);
  const [view, setView] = useState<"journey" | "dashboard">("journey");
  const [crowdSteps, setCrowdSteps] = useState<string[]>([]);
  // The Taste Galaxy as it forms, round by round, before the crowds are named.
  const [forming, setForming] = useState<GalaxyData | undefined>();
  const crowdKey = useRef<string>("");
  const [stopData, setStopData] = useState<Partial<Record<StopId, unknown>>>({});
  const pick = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (msgs.length > 1) localStorage.setItem(STORE, JSON.stringify({ brief, msgs: msgs.slice(-40), turn, journey: j } satisfies Saved));
    } catch {
      // Storage unavailable: the journey still works for this visit.
    }
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [brief, msgs, turn, j]);

  const say = (t: string) => setMsgs((m) => [...m, { who: "athena", text: t }]);
  const reached = (s: StopId) => j.stop === s || j.done.includes(s);
  const stops = j.growth.length ? stopsFor(j.growth) : (["product", "growth", "crowd"] as StopId[]);
  const move = (to: StopId) => setJ((x) => ({ ...x, stop: to, done: [...new Set([...x.done, x.stop])] }));
  const next = () => {
    const i = stops.indexOf(j.stop);
    if (i >= 0 && i < stops.length - 1) move(stops[i + 1]);
  };

  // The taste graph starts as soon as the product is clear (§14.9), while the founder answers the next questions.
  const startCrowds = () => {
    const body = {
      brand: brief.qloo?.match,
      comparables: brief.comparables.map((c) => c.value),
      lookalikes: brief.proxies ?? [],
      traits: brief.traits ?? [],
    };
    const key = JSON.stringify(body);
    if (crowdKey.current === key) return;
    crowdKey.current = key;
    if (j.crowds && j.crowdsFor === key) {
      // Already built for this product (a returning founder). Crowds saved before taste axes (§9.27) pick them up
      // from the server's copy, which factorises the stored graph once; nothing else about the crowds changes.
      // Probed crowds ask with their probes, so they read their own graph.
      const probes = j.crowds.probes ?? [];
      const same = (p?: string[]) => (p ?? []).join(",") === probes.join(",");
      if ((!j.crowds.axes || !j.crowds.meetings) && j.crowds.crowds.length)
        void fetch("/api/crowds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, probes, axesOnly: true }) })
          .then((r) => r.json() as Promise<Pick<CrowdsResult, "axes" | "meetings">>)
          .then(({ axes, meetings }) => (axes?.length || meetings) && setJ((x) => (x.crowds && x.crowdsFor === key && same(x.crowds.probes) ? { ...x, crowds: { ...x.crowds, ...(axes ? { axes } : {}), ...(meetings ? { meetings } : {}) } } : x)))
          .catch(() => undefined);
      return;
    }
    setCrowdSteps([]);
    setForming(undefined);
    setJ((x) => ({ ...x, crowds: undefined, crowdId: undefined, reactions: {}, pins: {}, lean: {} }));
    void crowdStream(key, (e) => {
      if (crowdKey.current !== key) return false;
      if (e.type === "status") setCrowdSteps((s) => [...s, e.text]);
      else if (e.type === "graph") setForming(e.galaxy);
      else setJ((x) => ({ ...x, crowds: e.result, crowdsFor: key, crowdId: defaultCrowd(e.result.crowds, x.growth) }));
      return true;
    }).catch(() => {
      if (crowdKey.current === key) setJ((x) => ({ ...x, crowds: { seed: { lookalikes: [], tags: [], missing: [] }, crowds: [], calls: 0, callIds: [], empty: true } }));
    });
  };

  // Click to probe (§13.11): the founder's entity becomes one more landmark; the crowds re-form around it. The map
  // stays on screen with one narrated line until the new one arrives, and a failed probe leaves it as it was.
  const [probing, setProbing] = useState<string>();
  const probe = (id: string, name: string) => {
    if (probing || !j.crowds || !j.crowdsFor) return;
    const key = j.crowdsFor;
    const probes = [...(j.crowds.probes ?? []), id];
    setProbing(`Probing ${name}`);
    void crowdStream(JSON.stringify({ ...JSON.parse(key), probes }), (e) => {
      if (crowdKey.current !== key) return false;
      if (e.type === "status") setProbing(e.text);
      else if (e.type === "result" && e.result.crowds.length)
        setJ((x) => {
          const ids = new Set(e.result.crowds.map((c) => c.id));
          const reactions = Object.fromEntries(Object.entries(x.reactions).filter(([c]) => ids.has(c)));
          // A probe re-factorises the graph, so the axes (and the sliders on them) start over.
          return { ...x, crowds: e.result, reactions, lean: {}, crowdId: x.crowdId && ids.has(x.crowdId) ? x.crowdId : defaultCrowd(e.result.crowds, x.growth) };
        });
      return true;
    })
      .catch(() => undefined)
      .finally(() => setProbing(undefined));
  };
  useEffect(() => {
    if (turn.ready) startCrowds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn.ready, brief.qloo?.match?.id, (brief.traits ?? []).join(), (brief.proxies ?? []).join()]);

  // Each stop's card comes into view as the stop opens.
  useEffect(() => {
    if (j.stop === "product") return;
    const t = setTimeout(() => document.getElementById(`stop-${j.stop}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [j.stop]);

  // Athena's line when a stop opens.
  const opened = useRef(new Set<StopId>(saved ? [...saved.journey.done, saved.journey.stop] : []));
  useEffect(() => {
    if (opened.current.has(j.stop)) return;
    opened.current.add(j.stop);
    if (j.stop === "growth") {
      const guess = brief.channel?.value;
      say(guess ? `Looks like ${brief.name?.value ?? "it"} sells ${guess === "both" ? "both online and in stores" : `mostly ${guess}`}. Right? Then pick how you want to grow: up to ${MAX_PICKS}.` : "Do you sell mostly online, mostly in stores and venues, or both? Then pick how you want to grow: up to 3.");
    }
    if (j.stop === "crowd") say("Here's who your product speaks to, read from Qloo's taste graph: real crowds, each a cluster of brands, music and TV the same people love. Tell me which ones sound like your customers.");
    if (j.stop === "go") say("That's the plan. Open the full plan to see it all on one screen, work your shortlists and draft outreach.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop]);

  // Athena's take on each stop, once its data is in (§6.2.2 step 3). Stops finished before a reload aren't retaken.
  const took = useRef(new Set<StopId>(saved ? saved.journey.done : []));
  useEffect(() => {
    const s = j.stop;
    if (took.current.has(s)) return;
    const t = takeFor(s, stopData[s], j.crowds?.crowds);
    if (!t) return;
    took.current.add(s);
    void fetch("/api/take", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stop: STOP_LABELS[s], brand: brief.name?.value, data: t.data, fallback: t.fallback }) })
      .then((r) => r.json() as Promise<{ text?: string }>)
      .then((r) => say(r.text || t.fallback))
      .catch(() => say(t.fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, stopData, j.crowds]);

  const crowd = j.crowds?.crowds.find((c) => c.id === j.crowdId);
  const base = useMemo(
    () => ({
      ...briefToInput(brief),
      comparables: (brief.comparables.length ? brief.comparables.map((c) => c.value) : (brief.proxies ?? [])).slice(0, 5),
      motions: motionsFor(j.growth),
      city: j.city,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brief.name?.value, brief.sells?.value, brief.stockists.length, j.growth.join(), j.city],
  );
  // Each stop's crowd, weighted by the founder's reactions (§9.23 step 7); with New crowd plus other picks, the
  // which-crowd answer decides which crowd each stop follows (§7.8).
  const signalFor = (s: StopId) => {
    const id = j.crowds ? crowdIdForStop(s, { growth: j.growth, crowds: j.crowds.crowds, crowdId: j.crowdId, target: j.crowdTarget, reactions: j.reactions }) : undefined;
    return id && j.crowds ? crowdSignal(j.crowds.crowds, id, j.reactions, j.pins) : undefined;
  };
  const inputFor = (s: StopId) => ({ ...base, crowd: signalFor(s) });
  const input = inputFor("go");
  // With / Without (§13.2): every stop's question also goes to Gemini alone, from the same product description.
  const alone: AloneRequest = { brand: brief.name?.value || "The brand", product: String(base.description ?? "").slice(0, 400) };
  // Taste axes (§9.27): the sliders live in the journey, so a lean set at the Crowd stop carries to every list.
  const taste: Taste | undefined = j.crowds?.axes?.length ? { axes: j.crowds.axes, lean: j.lean ?? {}, onLean: (id, pos) => setJ((x) => ({ ...x, lean: { ...x.lean, [id]: pos } })) } : undefined;

  // Prefetch (§14.9): the stop after this one starts in the background once its inputs are settled (a crowd, and a
  // city for the stops that use one), so it's ready when the founder arrives. Stays hidden until then.
  const nextStop = stops[stops.indexOf(j.stop) + 1];
  const prefetch = (s: StopId) => s === nextStop && j.done.includes("growth") && !!crowd && (!NEEDS_CITY.has(s) || !!j.city);

  if (view === "dashboard")
    return <Workspace slug="" brands={[]} custom={{ brief, input: { ...input, city: j.city } }} onBack={() => setView("journey")} />;

  const send = () => {
    if (!text.trim() && !chat.files.length) return;
    void chat.send(text);
    setText("");
  };

  return (
    <div
      className={`journey ${drag ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) chat.addFiles(e.dataTransfer.files);
      }}
    >
      <header className="topbar journey-top">
        <Link href="/" className="wordmark-link"><strong>Athena</strong></Link>
        <ol className="progress" aria-label="Your journey">
          {stops.map((s, i) => (
            <li key={s} className={j.stop === s ? "now" : j.done.includes(s) ? "done" : ""}>
              <button
                type="button"
                disabled={!reached(s)}
                onClick={() => document.getElementById(`stop-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                aria-current={j.stop === s ? "step" : undefined}
              >
                <span className="dot">{j.done.includes(s) ? "✓" : i + 1}</span> {STOP_LABELS[s]}
              </button>
            </li>
          ))}
        </ol>
        <div className="top-actions">
          {j.done.includes("crowd") && <button type="button" onClick={() => setView("dashboard")}>View full plan</button>}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              try {
                localStorage.removeItem(STORE);
              } catch {
                // Ignore.
              }
              window.location.reload();
            }}
          >
            Start over
          </button>
        </div>
      </header>

      <main className="journey-main">
        <section className="chat" aria-live="polite">
          <ol className="msgs">
            {msgs.map((m, i) => [
              <li key={i} className={`msg msg-${m.who}`}>
                {m.text}
                {!!m.files?.length && <span className="msg-files">{m.files.map((f) => <span key={f} className="chip">{f}</span>)}</span>}
              </li>,
              m.trail && <TrailView key={`t${i}`} trail={m.trail} />,
            ])}
            {busy && live && <li className="msg msg-athena streaming">{live}</li>}
            {queued && <li className="msg msg-athena typing">Finishing my research, then I&apos;ll read that…</li>}
            <div ref={end} />
          </ol>

          <Dock
            j={j}
            setJ={setJ}
            brief={brief}
            turn={turn}
            busy={busy}
            researching={chat.researching}
            onReply={(r) => void chat.send(r)}
            onNext={next}
            onMove={move}
            say={say}
            stopData={stopData}
            crowdReady={!!j.crowds}
            onDashboard={() => setView("dashboard")}
          />

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {!!chat.files.length && (
              <ul className="chips">
                {chat.files.map((f, i) => (
                  <li key={`${f.name}${i}`} className="chip">
                    {f.name} <button type="button" className="linkish" aria-label={`Remove ${f.name}`} onClick={() => chat.setFiles(chat.files.filter((_, k) => k !== i))}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              autoFocus
              rows={first ? 3 : 2}
              value={text}
              maxLength={8000}
              placeholder={first ? "e.g. We're Fishwife: premium tinned fish with playful packaging, about $9 a tin. Sold online and in 1,500 shops. eatfishwife.com" : j.stop === "product" ? "Reply, or drop in a file" : "Ask or change anything: \"drop gyms\", \"what about Austin?\""}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  chat.addFiles(e.clipboardData.files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="row-actions">
              <button type="button" onClick={() => pick.current?.click()}>Add files</button>
              <input ref={pick} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && chat.addFiles(e.target.files)} />
              <span className="muted small">Decks, stockist sheets, photos, PDFs. Read, never stored.</span>
              <button type="submit" className="primary" disabled={(busy && !chat.researching) || !!queued || (first ? !text.trim() : !text.trim() && !chat.files.length)}>Send</button>
            </div>
          </form>
        </section>

        <section className="journey-canvas" aria-label="Your plan so far">
          <div id="stop-product">
            <Understood brief={brief} chips={chat.chips} busy={busy} />
          </div>
          {reached("growth") && j.growth.length > 0 && j.done.includes("growth") && (
            <section id="stop-growth" className="card">
              <h3>How you&apos;ll grow</h3>
              <p>{j.channel === "online" ? "Mostly online" : j.channel === "offline" ? "Mostly in stores and venues" : "Online and in stores"} · {j.growth.map((g) => labelFor(g, j.channel)).join(", ")}</p>
            </section>
          )}
          {reached("crowd") && (
            <div id="stop-crowd">
              <CrowdStop
                j={j}
                steps={crowdSteps}
                forming={forming}
                onReact={(id, r) => setJ((x) => react(x, id, r))}
                onChoose={(id) => setJ((x) => ({ ...x, crowdId: id }))}
                onPin={(id, name, pin) => setJ((x) => ({ ...x, pins: pinned(x.pins, id, name, pin) }))}
                onProbe={probe}
                probing={probing}
                alone={alone}
                taste={taste}
              />
            </div>
          )}
          {stops
            .filter((s) => BLOCK_OF[s] && (reached(s) || prefetch(s)))
            .map((s) => (
              <div key={s} id={`stop-${s}`} hidden={!reached(s)}>
                <StopRunner alone={alone} taste={taste} stop={s} block={BLOCK_OF[s]!} input={CITY_STOPS.has(s) ? inputFor(s) : { ...inputFor(s), city: undefined }} brandName={brief.name?.value ?? "Your brand"} onData={(d) => setStopData((x) => (x[s] === d ? x : { ...x, [s]: d }))} />
              </div>
            ))}
          {stops
            .filter((s) => (s === "retailers" || s === "online") && (reached(s) || prefetch(s)))
            .map((s) => (
              <div key={s} id={`stop-${s}`} hidden={!reached(s)}>
                {crowd ? (
                  <ExtraStop
                    kind={s as "retailers" | "online"}
                    signal={(signalFor(s)?.signal ?? crowd.signal.map((x) => ({ ...x, weight: 1 }))).map((x) => ({ id: x.id, weight: x.weight }))}
                    crowdName={signalFor(s)?.name ?? crowd.name}
                    names={Object.fromEntries((signalFor(s)?.signal ?? crowd.signal).map((x) => [x.id, x.name]))}
                    product={[brief.sells?.value, ...(brief.traits ?? [])].filter(Boolean).join(", ")}
                    category={brief.retail}
                    evidence={[brief.channels?.value ?? "", ...brief.stockists.map((x) => x.value.name), ...brief.notes.map((n) => n.value)].filter(Boolean)}
                    skew={crowd.skew}
                    brandName={brief.name?.value ?? "your brand"}
                    alone={alone}
                    taste={taste}
                    onData={(d) => setStopData((x) => (x[s] === d ? x : { ...x, [s]: d }))}
                  />
                ) : (
                  <section className="card">
                    <h3>{STOP_LABELS[s]}</h3>
                    <p>This stop reads your crowd. Pick one at the Crowd stop and it fills in here.</p>
                  </section>
                )}
              </div>
            ))}
          {reached("go") && (
            <section id="stop-go" className="card go-card">
              <h3>Your plan is ready</h3>
              <p>Everything you chose, on one screen: the crowd, the map, your shortlists, the message and the calendar. Work the pipeline there.</p>
              <button type="button" className="primary" onClick={() => setView("dashboard")}>Open the full plan</button>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

/** Reads the crowds stream (status lines, Galaxy snapshots, one result). The handler returns false to stop listening. */
async function crowdStream(body: string, on: (e: CrowdsEvent) => boolean): Promise<void> {
  const res = await fetch("/api/crowds", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) if (p.startsWith("data:") && !on(JSON.parse(p.slice(5)) as CrowdsEvent)) return;
    if (done) return;
  }
}

/** The crowd the plan follows by default: the main one, or for New crowd the closest adjacent one. */
function defaultCrowd(crowds: CrowdCard[], growth: GrowthType[]): string | undefined {
  if (growth.includes("new_crowd")) return (crowds.find((c) => !c.main) ?? crowds[0])?.id;
  return crowds.find((c) => c.main)?.id ?? crowds[0]?.id;
}

/** "That's us" picks the crowd; "Partly" blends it in at half weight; "Not us" moves the plan off it and leaves its entities out (§9.23 step 7). */
function react(x: JourneyState, id: string, r: Reaction): JourneyState {
  const reactions = { ...x.reactions, [id]: r };
  const crowds = x.crowds?.crowds ?? [];
  let crowdId = x.crowdId;
  // With New crowd, "That's us" marks today's customers; the plan keeps following the new crowd (§7.8).
  if (r === "us" && !x.growth.includes("new_crowd")) crowdId = id;
  if (r === "not_us" && crowdId === id) crowdId = crowds.find((c) => reactions[c.id] !== "not_us" && c.id !== id)?.id ?? crowdId;
  return { ...x, reactions, crowdId };
}

/** A Galaxy pin set, changed or cleared. */
function pinned(pins: Record<string, Pin> | undefined, id: string, name: string, pin: Pin["pin"] | undefined): Record<string, Pin> {
  const next = { ...pins };
  if (pin) next[id] = { name, pin };
  else delete next[id];
  return next;
}

/** What the growth rules need to know about the brand (§7.8 prerequisites). */
function factsFor(brief: BrandBrief, channel: Channel | undefined) {
  return {
    channel,
    hasPresence: brief.stockists.length > 0 || !!brief.activeCity || /stock|shops?|stores?|cafés?|cafes?|grocers?|retail/i.test(brief.channels?.value ?? ""),
    physical: !/\b(app|software|platform|saas)\b/i.test(brief.sells?.value ?? ""),
  };
}

/** The choices for the current stop, above the composer. */
function Dock(props: {
  j: JourneyState;
  setJ: React.Dispatch<React.SetStateAction<JourneyState>>;
  brief: BrandBrief;
  turn: Turn;
  busy: boolean;
  researching: boolean;
  onReply: (r: string) => void;
  onNext: () => void;
  onMove: (s: StopId) => void;
  say: (t: string) => void;
  stopData: Partial<Record<StopId, unknown>>;
  crowdReady: boolean;
  onDashboard: () => void;
}) {
  const { j, setJ, brief, turn, busy } = props;
  const [city, setCity] = useState("");
  // A typed place that fits several real ones ("Portland") waits here for the founder's pick (§9.3).
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[] | null>(null);
  const [placing, setPlacing] = useState(false);
  // Athena pre-selects from its guess; once the founder changes a pick, the picks are theirs.
  const touched = useRef(false);
  const guess = j.channel ?? brief.channel?.value;
  useEffect(() => {
    if (j.stop === "growth" && guess && !touched.current) setJ((x) => (x.growth.length ? x : { ...x, growth: suggest(factsFor(brief, guess)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.stop, guess]);
  if (j.stop === "product") {
    if (busy && !props.researching) return null;
    return (
      <div className="replies">
        {turn.replies.filter((r) => r !== GUESS || !turn.ready).map((r) => (
          <button key={r} type="button" onClick={() => props.onReply(r)}>{r}</button>
        ))}
        {turn.ready && <button type="button" className="primary" onClick={() => props.onMove("growth")}>Next: how you sell and grow →</button>}
      </div>
    );
  }
  if (j.stop === "growth") {
    const facts = factsFor(brief, guess);
    const channel = facts.channel;
    const choose = (c: Channel) => setJ((x) => ({ ...x, channel: c, growth: touched.current && x.growth.length ? x.growth : suggest({ ...facts, channel: c }) }));
    const toggle = (g: GrowthType) => {
      touched.current = true;
      setJ((x) => ({ ...x, growth: x.growth.includes(g) ? x.growth.filter((y) => y !== g) : [...x.growth, g] }));
    };
    const note = spreadNote(j.growth);
    const decisions = decisionsFor(j.growth);
    return (
      <div className="dock">
        <div className="seg" role="radiogroup" aria-label="How it mostly sells">
          {(["online", "offline", "both"] as Channel[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={channel === c} className={channel === c ? "on" : ""} onClick={() => choose(c)}>
              {c === "online" ? "Mostly online" : c === "offline" ? "Mostly offline" : "Both"}
              {brief.channel?.value === c && !j.channel && <small> · {brief.channel.source.kind === "message" ? "you said" : "from the web"}</small>}
            </button>
          ))}
        </div>
        {channel && (
          <div className="growth-cards">
            {orderFor(channel).map((g) => {
              const why = blockedReason(g, facts);
              const on = j.growth.includes(g);
              const star = GROWTH[g].suggestedFor.includes(channel) || (channel === "both" && GROWTH[g].suggestedFor.length > 0);
              return (
                <button key={g} type="button" className={`growth ${on ? "on" : ""}`} disabled={!!why} aria-pressed={on} onClick={() => toggle(g)} title={why}>
                  <strong>{star && "⭐ "}{labelFor(g, channel)}{GROWTH[g].beta && <small className="muted"> Beta</small>}</strong>
                  <span>{GROWTH[g].question}</span>
                  {why && <small className="muted">{why}</small>}
                </button>
              );
            })}
          </div>
        )}
        {note && <p className="small thin-note">{note}</p>}
        {decisions.map((d) => <p key={d.id} className="small muted">{d.text} I&apos;ll ask when we get there.</p>)}
        <div className="replies">
          <button type="button" className="primary" disabled={!channel || !j.growth.length} onClick={() => props.onNext()}>
            {props.crowdReady ? "See your crowds →" : "Next: your crowds →"}
          </button>
        </div>
      </div>
    );
  }
  if (j.stop === "crowd") {
    const chosen = j.crowds?.crowds.find((c) => c.id === j.crowdId);
    // §7.8: New crowd plus other picks needs one answer: who do the other picks target?
    const which = j.crowds?.crowds.length && chosen ? decisionsFor(j.growth).find((d) => d.id === "which_crowd") : undefined;
    const current = j.crowds?.crowds.find((c) => j.reactions[c.id] === "us" && c.id !== j.crowdId) ?? j.crowds?.crowds.find((c) => c.main && c.id !== j.crowdId);
    return (
      <div className="dock">
        {which && current && (
          <div className="which-crowd">
            <p className="small">
              {which.for!.map((g) => labelFor(g, j.channel)).join(" and ")}: should {which.for!.length > 1 ? "these" : "this"} target your current crowd or the new one?
            </p>
            <div className="seg" role="radiogroup" aria-label="Which crowd the other picks target">
              {(["current", "new"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={j.crowdTarget === t} className={j.crowdTarget === t ? "on" : ""} onClick={() => setJ((x) => ({ ...x, crowdTarget: t }))}>
                  {t === "current" ? `Current: ${current.name}` : `New: ${chosen!.name}`}
                </button>
              ))}
            </div>
          </div>
        )}
      <div className="replies">
        <button
          type="button"
          className="primary"
          disabled={!j.crowds || (!!which && !!current && !j.crowdTarget)}
          onClick={() => {
            props.say(chosen ? `Planning for ${chosen.name}: ${chosen.loves.slice(0, 3).map((l) => l.name).join(", ")}.` : "Planning from your brand and brands like it.");
            props.onNext();
          }}
        >
          {chosen ? `Plan for ${chosen.name} →` : j.crowds ? "Continue →" : "Reading your crowds…"}
        </button>
      </div>
      </div>
    );
  }
  if (j.stop === "where") {
    const m = props.stopData.where as MarketsData | undefined;
    // A pick from the list passes its metro id. A typed place (any state, county, city, neighbourhood, zip or region)
    // is resolved first; Athena asks when it fits several places or can't be placed, and never guesses (§9.3).
    const set = (id: string, name: string, note = "") => {
      setPlaceOptions(null);
      setJ((x) => ({ ...x, city: id }));
      props.say(`${note}${name} it is. Everything next is ranked for that area.`);
      props.onNext();
    };
    const place = async (text: string) => {
      setPlacing(true);
      try {
        const r = (await fetch("/api/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).then((x) => x.json())) as Resolution;
        if (r.status === "ok") {
          setCity("");
          set(r.id, r.label, r.read && r.read.length > 1 ? `I read “${text}” as ${r.read.join(", ")}. ` : "");
        } else if (r.status === "ask") {
          setPlaceOptions(r.options);
          props.say(r.question);
        } else {
          setPlaceOptions(null);
          props.say(r.question);
        }
      } catch {
        props.say(`Which city, county, state or zip code is “${text}”?`);
      } finally {
        setPlacing(false);
      }
    };
    return (
      <div className="dock">
        {m ? (
          <>
            <p className="small muted">Where should the plan start? {m.method === "brands" ? <>Each city scored on how strongly your crowd&apos;s brands rank there.</> : <>Ranked by how much of your crowd&apos;s taste each city holds.</>}</p>
            <div className="replies">
              {m.metros.slice(0, 5).map((r) => (
                <button key={r.metroId} type="button" className={r.metroId === m.target.metroId ? "primary" : ""} onClick={() => set(r.metroId, r.name)}>
                  {r.rank}. {r.name}
                </button>
              ))}
            </div>
            <form
              className="inline-city"
              onSubmit={(e) => {
                e.preventDefault();
                if (city.trim()) void place(city.trim());
              }}
            >
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Or type any US place: a city, state, zip, neighbourhood…" maxLength={80} />
              <button type="submit" disabled={!city.trim() || placing}>{placing ? "Finding it…" : "Use it"}</button>
            </form>
            {placeOptions && (
              <div className="replies" role="group" aria-label="Which place">
                {placeOptions.map((o) => (
                  <button key={o.id} type="button" onClick={() => set(o.id, o.label)} title={o.detail}>
                    {o.label} <small className="muted">{o.detail}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="small muted">Ranking cities for your crowd…</p>
        )}
      </div>
    );
  }
  if (j.stop === "go") {
    return (
      <div className="replies">
        <button type="button" className="primary" onClick={props.onDashboard}>Open the full plan</button>
      </div>
    );
  }
  return (
    <div className="replies">
      <button type="button" className="primary" onClick={props.onNext}>Continue →</button>
    </div>
  );
}

const SKEW_LABEL = "Aggregate taste-panel signal from Qloo, relative to average. It describes people who share this taste, not your customers. Treat it as something to test, not a fact.";

function skewLine(s: CrowdCard["skew"]): string | undefined {
  if (!s?.clear) return undefined;
  const ages: Record<string, string> = { "24_and_younger": "under 25", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };
  const topAge = Object.entries(s.age).sort((a, b) => b[1] - a[1])[0];
  const g = s.gender.female >= 0.1 ? "female" : s.gender.male >= 0.1 ? "male" : undefined;
  return [topAge && topAge[1] >= 0.1 ? `leans ${ages[topAge[0]] ?? topAge[0]}` : "", g ? `leans ${g}` : ""].filter(Boolean).join(", ");
}

/** The Crowd stop (§9.23, J3): 2–3 crowds from Qloo's taste graph; the founder says which sound like their customers. */
function CrowdStop({ j, steps, forming, onReact, onChoose, onPin, onProbe, probing, alone, taste }: { j: JourneyState; steps: string[]; forming?: GalaxyData; onReact: (id: string, r: Reaction) => void; onChoose: (id: string) => void; onPin: (id: string, name: string, pin: Pin["pin"] | undefined) => void; onProbe: (id: string, name: string) => void; probing?: string; alone: AloneRequest; taste?: Taste }) {
  const r = j.crowds;
  // Linked views (§9.26): the crowd under the pointer in the Galaxy, the map or the cards lights up in all three.
  const [lit, setLit] = useState<number | null>(null);
  const pins = j.pins ?? {};
  // While the crowds are measured, the Galaxy forms in place of the step list (from the first ring, about 5 s in).
  if (!r && forming) return <Galaxy galaxy={forming} pins={pins} onPin={onPin} step={steps[steps.length - 1]} />;
  if (!r)
    return (
      <section className="card">
        <h3>Your crowds</h3>
        <ol className="steps live-steps">
          {(steps.length ? steps : ["Reading your product into Qloo"]).map((s, i, all) => (
            <li key={i} className={i === all.length - 1 ? "step-active" : "step-done"}>
              <span className={i === all.length - 1 ? "spin" : "tick"} aria-hidden>{i === all.length - 1 ? "" : "✓"}</span>
              <span className={i === all.length - 1 ? "shimmer-text" : ""}>{s}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  if (!r.crowds.length)
    return (
      <section className="card">
        <h3>Your crowds</h3>
        <p>Qloo doesn&apos;t have enough on this product yet to split its crowd, so the plan reads your brand and brands like it directly.</p>
      </section>
    );
  const from = [r.seed.brand?.name, ...r.seed.lookalikes.map((l) => l.name)].filter(Boolean);
  return (
    <section className="crowds">
      {r.galaxy && <Galaxy galaxy={r.galaxy} names={r.crowds.map((c) => c.name)} pins={pins} onPin={onPin} probes={r.probes ?? []} onProbe={onProbe} probing={probing} lit={lit} onLight={setLit} />}
      {!probing && <CrowdGeography crowds={r.crowds} lit={lit} onLight={setLit} />}
      <header className="card-head">
        <h3>Your crowds</h3>
        <p className="small muted">
          Read from {from.join(", ")}{r.seed.tags.length ? ` and the traits ${r.seed.tags.map((t) => t.name.toLowerCase()).join(", ")}` : ""}. Built from {r.calls} Qloo calls.
        </p>
      </header>
      <div className="crowd-grid">
        {r.crowds.map((c, ci) => {
          const chosen = j.crowdId === c.id;
          const reaction = j.reactions[c.id];
          const skew = skewLine(c.skew);
          return (
            <article key={c.id} className={`crowd ${chosen ? "chosen" : ""} ${reaction === "not_us" ? "dimmed" : ""}${lit === ci ? " lit" : ""}`} onMouseEnter={() => setLit(ci)} onMouseLeave={() => setLit(null)}>
              <p className="crowd-tag">{c.main ? "Closest to your product" : "Next door"}</p>
              <h4>
                <span className="swatch" style={{ background: `var(--crowd-${ci % 4})` }} aria-hidden />
                {c.name}
              </h4>
              <div className="taste-loves">
                {c.loves.map((l, i) => (
                  <span key={l.name} className="love" style={{ animationDelay: `${i * 50}ms` }}>
                    {l.name} <small>{l.kind}</small>
                  </span>
                ))}
              </div>
              {!!c.cities.length && <p className="small"><strong>Concentrates in</strong> {c.cities.slice(0, 4).map((x) => x.name).join(", ")}</p>}
              <Meeting r={r} crowd={c} />
              {skew && <p className="small" title={SKEW_LABEL}><strong>Audience</strong> {skew} <span className="muted">· Qloo taste panel, to test</span></p>}
              <div className="react" role="group" aria-label={`Is ${c.name} your customer?`}>
                {(["us", "partly", "not_us"] as Reaction[]).map((x) => (
                  <button key={x} type="button" className={reaction === x ? "on" : ""} aria-pressed={reaction === x} onClick={() => onReact(c.id, x)}>
                    {x === "us" ? "That's us" : x === "partly" ? "Partly" : "Not us"}
                  </button>
                ))}
              </div>
              {!chosen && reaction !== "not_us" && <button type="button" className="linkish small" onClick={() => onChoose(c.id)}>Plan for this crowd instead</button>}
              {chosen && <p className="small chosen-note">The plan follows this crowd</p>}
              {!chosen && reaction === "partly" && <p className="small muted">Blended into the plan at half weight</p>}
              {reaction === "not_us" && <p className="small muted">Left out of every ranking</p>}
            </article>
          );
        })}
      </div>
      {taste && !probing && <TasteAxes taste={taste} />}
      <WithWithout stop="crowd" question="Who are this product's customers, and what do they love?" athena={r.crowds.map((c) => ({ name: c.name, why: c.loves.slice(0, 6).map((l) => l.name).join(", ") }))} request={alone} />
      <p className="small muted">{SKEW_LABEL}</p>
    </section>
  );
}

/** Next retailers (§9.25), re-ranked under the taste sliders (§9.27) when they lean. */
function Retailers({ r, signal, crowdName, names, alone, taste }: { r: RetailersResult; signal: { id: string; weight: number }[]; crowdName: string; names: Record<string, string>; alone: AloneRequest; taste?: Taste }) {
  const lean = useLean("brand", r.picks.slice(0, 50).map((p) => p.id), signal, taste);
  const byId = new Map(r.picks.map((p) => [p.id, p]));
  const leaned = lean.order.map((id) => byId.get(id)!).filter(Boolean);
  // As in the stop itself, own-label retailers go last; the rest take the leaned order.
  const picks = [...leaned.filter((p) => !p.ownLabel), ...leaned.filter((p) => p.ownLabel)];
  const top = picks.slice(0, 8);
  return (
      <section className="card">
        <h3>Next retailers</h3>
        <p className="small muted">Bigger retailers ranked by how much your crowd loves each one (Qloo). Built from {r.calls} Qloo calls.</p>
        {taste && <TasteAxes taste={taste} compact busy={lean.busy} note={lean.note} />}
        {r.already.length > 0 && <p className="small"><strong>You&apos;re already in</strong> {r.already.join(", ")}, so they&apos;re left out.</p>}
        {top.length ? (
          <ol className="rank-list">
            {top.map((p, i) => (
              <li key={p.id}>
                <span className="rank">{i + 1}</span>
                <span className="grow"><strong>{p.name}</strong>{p.ownLabel && <small className="muted"> · mostly sells its own label</small>}</span>
                <small className="muted">affinity {(lean.affinity?.[p.id] ?? p.affinity).toFixed(2)}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>Every retailer on my list is already one of yours. Add a few you&apos;re eyeing in the chat and I&apos;ll rank them.</p>
        )}
        <ShowWhy crowd={crowdName} names={names} picks={top.map((p) => ({ ...p, why: lean.why?.[p.id] ?? p.why }))} />
        <p className="small muted">Fit means your crowd loves the retailer, not that a buyer will say yes.</p>
        {r.picks.length > 1 && <WithWithout stop="retailers" question={`Which of these ${r.picks.length} retailers are most likely to carry this product?`} athena={picks.map((p) => ({ id: p.id, name: p.name }))} request={{ ...alone, candidates: r.picks.map((p) => ({ id: p.id, label: p.name })) }} bench="t2" ranked />}
      </section>
  );
}

/** Where a next-door crowd meets the main one (§9.28): what both love, each side's percentile on hover. */
function Meeting({ r, crowd }: { r: NonNullable<JourneyState["crowds"]>; crowd: CrowdCard }) {
  const m = r.meetings?.find((x) => x.b === crowd.id);
  const main = r.crowds.find((c) => c.id === m?.a);
  if (!m || !main) return null;
  return (
    <p className="small meeting">
      <strong>Meets {main.name} at</strong>{" "}
      {m.items.slice(0, 4).map((x, i) => (
        <span key={x.id} title={`${main.name}: ${Math.round(x.a * 100)}th percentile · ${crowd.name}: ${Math.round(x.b * 100)}th`}>
          {i ? ", " : ""}
          {x.name}
        </span>
      ))}
    </p>
  );
}

type RetailersResult = { picks: { id: string; name: string; affinity: number; rank: number; ownLabel: boolean; why?: Contribution[] }[]; already: string[]; calls: number; category?: string };
type OnlineResult = { creators: { id: string; name: string; role: string; affinity: number }[]; podcasts: { id: string; name: string; affinity: number }[]; interests: { id: string; name: string }[]; calls: number };

/** Next retailers (§9.25) and Online (§9.24): small stops outside the six blocks, read for the chosen crowd. */
function ExtraStop({ kind, signal, crowdName, names, product, category, evidence, skew, brandName, alone, taste, onData }: { kind: "retailers" | "online"; signal: { id: string; weight: number }[]; crowdName: string; names: Record<string, string>; product: string; category?: string; evidence: string[]; skew: CrowdCard["skew"]; brandName: string; alone: AloneRequest; taste?: Taste; onData: (d: unknown) => void }) {
  const [data, setData] = useState<RetailersResult | OnlineResult | null>(null);
  const key = JSON.stringify([kind, signal]);
  useEffect(() => {
    let live = true;
    setData(null);
    fetch("/api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, signal, product, category, evidence }) })
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setData(d);
        onData(d);
      })
      .catch(() => live && setData(kind === "retailers" ? { picks: [], already: [], calls: 0 } : { creators: [], podcasts: [], interests: [], calls: 0 }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!data)
    return (
      <section className="card">
        <h3>{STOP_LABELS[kind]}</h3>
        <ol className="steps live-steps">
          <li className="step-active"><span className="spin" aria-hidden /><span className="shimmer-text">{kind === "retailers" ? "Ranking bigger retailers by how much your crowd loves them" : "Finding the creators, podcasts and interests your crowd follows"}</span></li>
        </ol>
      </section>
    );
  if (kind === "retailers") return <Retailers r={data as RetailersResult} signal={signal} crowdName={crowdName} names={names} alone={alone} taste={taste} />;
  const o = data as OnlineResult;
  const skewNote = skewLine(skew);
  return (
    <section className="card">
      <h3>Online</h3>
      <p className="small muted">Who your crowd follows, and what to test in ads (Qloo). Built from {o.calls} Qloo calls.</p>
      {o.creators.length > 0 && (
        <>
          <h4>Creators to partner with</h4>
          <ol className="rank-list">
            {o.creators.map((c, i) => (
              <li key={c.id}>
                <span className="rank">{i + 1}</span>
                <span className="grow"><strong>{c.name}</strong> <small className="muted">· {c.role}</small></span>
                <a className="small" href={`https://www.google.com/search?q=${encodeURIComponent(c.name)}`} target="_blank" rel="noreferrer noopener">Find them ↗</a>
              </li>
            ))}
          </ol>
          <p className="small muted">People in their professional role, approached as partners through drafts you send.</p>
        </>
      )}
      {o.podcasts.length > 0 && (
        <>
          <h4>Podcasts</h4>
          <div className="taste-loves">{o.podcasts.map((p) => <span key={p.id} className="love">{p.name}</span>)}</div>
        </>
      )}
      {o.interests.length > 0 && (
        <>
          <h4>Ad interests to test</h4>
          <p className="small">Your crowd over-indexes on {o.interests.slice(0, 5).map((x) => x.name.toLowerCase()).join(", ")}. Try these as ad interests for {brandName}.</p>
        </>
      )}
      {skewNote && <p className="small"><strong>Audience to test</strong> Qloo&apos;s taste panel {skewNote.replace(/leans/g, "leans")} for this crowd. Worth testing as an ad audience alongside your current one.</p>}
      <WithWithout stop="online" question="Online, which creators and podcasts do this product's customers follow, and what should it target in ads?" athena={[...o.creators.map((c) => ({ name: c.name, why: c.role })), ...o.podcasts.map((p) => ({ name: p.name, why: "podcast" })), ...o.interests.slice(0, 5).map((x) => ({ name: x.name, why: "ad interest" }))]} request={alone} />
      <p className="small muted">{SKEW_LABEL}</p>
    </section>
  );
}

/** One stop on the plan engine: a scoped run of one block for the chosen crowd and city. */
function StopRunner({ stop, block, input, brandName, alone, taste, onData }: { stop: StopId; block: Block; input: Record<string, unknown>; brandName: string; alone: AloneRequest; taste?: Taste; onData: (d: unknown) => void }) {
  const key = JSON.stringify(input);
  const source: PlanSource = useMemo(() => ({ kind: "custom", input, id: hash(`${block}|${key}`), scope: [block] }), [block, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = usePlan(source);
  const b = plan.blocks[block];
  const [selected, setSelected] = useState<string>();
  useEffect(() => {
    if (b) onData(b.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);
  if (!b) {
    const steps = plan.rail.slice(-4);
    return (
      <section className="card">
        <h3>{STOP_LABELS[stop]}</h3>
        <ol className="steps live-steps">
          {(steps.length ? steps.map((e) => e.why) : ["Starting"]).map((s, i, all) => (
            <li key={i} className={i === all.length - 1 ? "step-active" : "step-done"}>
              <span className={i === all.length - 1 ? "spin" : "tick"} aria-hidden>{i === all.length - 1 ? "" : "✓"}</span>
              <span className={i === all.length - 1 ? "shimmer-text" : ""}>{s}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  const none = () => undefined;
  switch (block) {
    case "markets": {
      const m = b.data as MarketsData;
      return (
        <section className="card stop-block">
          <div className="stop-map">
            <MapView center={m.target.center} bbox={m.target.bbox} cells={m.heatmap.cells} pins={[]} onSelect={none} />
          </div>
          <MarketsView data={m} meta={b.meta} onTrace={none} />
          <WithWithout stop="where" question="In which of the 25 largest US metros will this product find the most independent shops to sell it, per resident?" athena={m.metros.map((x) => ({ id: x.metroId, name: x.name }))} request={alone} bench="t1" ranked />
        </section>
      );
    }
    case "places": {
      const p = b.data as PlacesData;
      return (
        <section className="card stop-block">
          <LeanPlaces p={p} crowd={input.crowd as { name: string; signal: { id: string; name: string; weight: number }[] } | undefined} taste={taste}>
            {(data, lean) => (
              <>
                {lean}
          <PlacesView
            data={data}
            meta={b.meta}
            selectedId={selected}
            onSelect={(id) => setSelected(id === selected ? undefined : id)}
            onTrace={none}
            draft={{ brand: brandName, product: String(input.description ?? "").split(".")[0], partners: [] }}
            // Without Qloo (§9.9): the same question to a chatbot with search, side by side; capped (§14.5).
            compare={{ key: `journey-${hash(`${brandName}|${p.metroId}|${p.signal.join()}`)}`, brandName, whatYouSell: String(input.description ?? "").split(".")[0], tier: String(input.tierHint ?? "") }}
          />
              </>
            )}
          </LeanPlaces>
          <BenchNote task="t3" />
        </section>
      );
    }
    case "partners": {
      const d = b.data as PartnersData;
      return (
        <section className="card stop-block">
          <PartnersView data={d} meta={b.meta} onTrace={none} />
          <WithWithout stop="partners" question="Which brands and podcasts should this brand partner with?" athena={[...d.brands, ...d.podcasts].map((x) => ({ name: x.name, why: x.kind }))} request={alone} />
        </section>
      );
    }
    case "message": {
      const d = b.data as MessageData;
      return (
        <section className="card stop-block">
          <MessageView data={d} meta={b.meta} onTrace={none} />
          <WithWithout stop="message" question="How should this brand talk to its customers: which themes, and which shows, films, artists or books to reference?" athena={[...d.themes.slice(0, 6).map((t) => ({ name: t.name, why: "theme" })), ...d.references.slice(0, 4).map((r) => ({ name: r.name, why: "reference" }))]} request={alone} />
        </section>
      );
    }
    case "moments": {
      const d = b.data as MomentsData;
      return (
        <section className="card stop-block">
          <MomentsView data={d} meta={b.meta} onTrace={none} />
          {d.moments.length > 0 && <WithWithout stop="moments" question="Which dated events in this city in the next six months should this brand show up at?" athena={d.moments.map((x) => ({ name: x.name, why: [x.date, x.venue].filter(Boolean).join(" · ") }))} request={{ ...alone, metroId: d.metroId }} />}
        </section>
      );
    }
    default:
      return null;
  }
}

/** Places ranked against the crowd (§9.23) re-rank under the taste sliders (§9.27); ranked against accounts, they don't. */
function LeanPlaces({ p, crowd, taste, children }: { p: PlacesData; crowd?: { name: string; signal: { id: string; name: string; weight: number }[] }; taste?: Taste; children: (data: PlacesData, lean: ReactNode) => ReactNode }) {
  const fromCrowd = !!(p.fromCrowd && crowd?.signal?.length);
  const on = !!(taste && fromCrowd);
  const lean = useLean("place", p.picks.slice(0, 50).map((x) => x.id), on ? crowd!.signal : [], on ? taste : undefined);
  const byId = new Map(p.picks.map((x) => [x.id, x]));
  const picks = on ? lean.order.flatMap((id, i) => (byId.has(id) ? [{ ...byId.get(id)!, rank: i + 1, why: lean.why?.[id] ?? byId.get(id)!.why }] : [])) : p.picks;
  // Why-paths (§9.28) need the signal's names; the crowd's are known here, the founder's accounts' aren't.
  const why = fromCrowd ? <ShowWhy crowd={crowd!.name} names={Object.fromEntries(crowd!.signal.map((x) => [x.id, x.name]))} picks={picks} /> : null;
  return (
    <>
      {children(on ? { ...p, picks } : p, on ? <TasteAxes taste={taste!} compact busy={lean.busy} note={lean.note} /> : null)}
      {why}
    </>
  );
}
