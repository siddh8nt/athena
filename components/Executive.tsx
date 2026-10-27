"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { TeamLive } from "./Team";
import { planStale, planUnitemised } from "@/lib/agent/synthesis";
import { nameOf, type SpecialistId } from "@/lib/agent/specialists";
import { strengthWord } from "@/lib/agent/fit";
import { TIER_LABEL } from "@/lib/team/page";
import { markLabel, type Drafts, type Src, type TeamState } from "@/lib/team/types";
import {
  EXEC_TABS,
  contactKey,
  contactOf,
  execPlan,
  followUpDraft,
  iconsOf,
  isPerson,
  profileButtons,
  profileOf,
  resultsOf,
  stageOf,
  statesOf,
  tabItems,
  waitingSteps,
  wayIn,
  type ContactView,
  type ExecItem,
  type ExecPlan,
  type ExecTab,
  type Icon,
  type ItemState,
  type Stage,
} from "@/lib/exec/plan";

// Execute Plan (PRD §23.5 r): a live task orchestrator. After Start it works through every target by itself, Now
// first: each row goes Queued → Reading → Drafting → Ready (or Needs a contact) as it works, then Sent → Waiting →
// Replied, or Follow-up, as the founder tells Athena in chat. A row opens in place to show why it's on the plan, how it
// was found, the ways to reach them, the drafts and its history. Nothing is sent from here: drafts are copied, or opened
// in the founder's mail or DM app.

type Opens = SpecialistId | "athena" | "dashboard";

type Props = {
  team: TeamState;
  live: TeamLive;
  brand: string;
  budget?: string;
  running: boolean;
  onStart: () => void;
  onOpened: (id: string) => void;
  onStartAnyway: (n: number) => void;
  onAsk: (it: ExecItem) => void;
  onOpen: (id: Opens) => void;
  onUpdatePlan: () => void;
  onRewritePlan: () => void;
};

type Run = { queue: string[]; rows: Record<string, string> };
type Pipe = "ready" | "sent" | "waiting" | "replied" | "follow";
const PIPE: { k: Pipe; label: string; stages: Stage[] }[] = [
  { k: "ready", label: "Ready", stages: ["ready"] },
  { k: "sent", label: "Sent", stages: ["sent"] },
  { k: "waiting", label: "Waiting", stages: ["waiting"] },
  { k: "replied", label: "Replied", stages: ["yes", "no"] },
  { k: "follow", label: "Follow-up", stages: ["follow"] },
];
const PAGE = 40;
const TONES = ["Warmer", "Shorter", "More premium"];

const tabLabel = (t: ExecTab) => (t === "now" ? "Now" : t === "results" ? "Results" : nameOf(t));
const owner = (it: ExecItem) => (it.agent === "athena" ? "Athena" : nameOf(it.agent));
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const cap = (s: string) => `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`;
const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""));
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const day = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isChild = (it: ExecItem, plan: ExecPlan) => !!it.parent && plan.byId.has(it.parent);

/** A sourced date read at noon UTC, so the day never slips. */
const dateOf = (d?: string) => {
  const t = d ? Date.parse(/T/.test(d) ? d : `${d}T12:00:00Z`) : NaN;
  return Number.isNaN(t) ? undefined : new Date(t);
};
const monthOf = (d?: string) => dateOf(d)?.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
/** A page as a short link: its host and path. */
const shortUrl = (u: string) => {
  try {
    const x = new URL(u);
    const s = `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`;
    return s.length > 42 ? `${s.slice(0, 40)}…` : s;
  } catch {
    return u;
  }
};

/** The filters an item answers to on a tab: each shows once two or more values exist. */
function filtersOf(it: ExecItem, tab: ExecTab): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (tab === "now") out.Subagent = [owner(it)];
  if (it.crowds.length) out.Crowd = it.crowds;
  if (tab === "promoter") out.Where = it.cities.length ? it.cities : it.kind === "audience" ? ["Online"] : ["US-wide"];
  else if (it.cities.length) out.City = it.cities;
  // Now mixes every subagent in Athena's order: subagent, crowd and city only; each subagent's own filters are on its tab.
  if (tab === "now") return out;
  for (const [k, v] of Object.entries(it.facets)) if (v.length && !out[k] && !/email/i.test(k)) out[k] = v;
  return out;
}

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The text stays on screen to select by hand.
    return false;
  }
};

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ---- What a row says about itself

const fact = (it: ExecItem, l: string) => it.detail?.facts.find((f) => f.label === l)?.value?.trim();
/** Values that say what isn't known: never shown as a reason. */
const UNKNOWN = /^(not a fit|unknown|not published|can't be checked|none found|no public|no email|qloo gives no|on their profile|not checked|size unknown)/i;

/** An event's next move: its "Apply…" step, else its apply line. */
const applyOf = (it: ExecItem, plan: ExecPlan) => plan.items.find((k) => k.parent === it.id && /^apply/i.test(k.name))?.name ?? it.detail?.lines?.find((l) => /^apply/i.test(l));

/** The row's evidence, in its subagent's terms: why this one, in a few words. */
function evidenceOf(it: ExecItem, plan: ExecPlan): string | undefined {
  const lines = it.detail?.lines ?? [];
  const join = (xs: (string | undefined | false)[]) => xs.filter(Boolean).join(" · ") || undefined;
  if (it.kind === "venue") return join([it.facets.Neighbourhood?.[0], lines.find((l) => /^loved by fans of/i.test(l))]);
  if (it.kind === "retailer") {
    const rank = fact(it, "Rank for this crowd");
    const stores = fact(it, "Stores in your cities");
    return join([rank && `${rank} by shopper overlap`, stores && !/^none/i.test(stores) && `Stores in ${stores}`]);
  }
  if (it.kind === "partner" || it.kind === "creator" || it.kind === "podcast") {
    const format = fact(it, "Format");
    const idea = format ? format.split(" (also:")[0] : fact(it, "Offer");
    const band = it.facets.Band?.[0];
    return join([idea && !UNKNOWN.test(idea) && idea, band && !/unknown/i.test(band) && band]);
  }
  if (it.kind === "event") return applyOf(it, plan);
  if (it.kind === "audience") return fact(it, "How to show up");
  return undefined;
}

/** The Analyst's crowds, as one context line on every row. */
function forOf(it: ExecItem, all: string[]) {
  if (!it.crowds.length) return undefined;
  if (all.length > 1 && all.every((c) => it.crowds.includes(c))) return all.length === 2 ? "For both crowds" : `For all ${["", "", "", "three", "four", "five"][all.length] ?? all.length} crowds`;
  return `For ${and(it.crowds)}`;
}

type Ctx = {
  plan: ExecPlan;
  team: TeamState;
  state: (id: string) => ItemState;
  stage: (it: ExecItem) => Stage;
  run?: Run;
  now: number;
  brand: string;
  crowds: string[];
  openId?: string;
  setOpen: (id?: string) => void;
  p: Props;
};

function stageText(sg: Stage, it: ExecItem, ctx: Ctx): string | undefined {
  const key = contactKey(it);
  if (sg === "queued") {
    if (!ctx.team.exec?.started) return "Waits on Start";
    const i = key && ctx.run ? ctx.run.queue.indexOf(key) : -1;
    return i >= 0 ? `${ord(i + 1)} in line` : "Queued";
  }
  if (sg === "reading") return (key && ctx.run?.rows[key]) || "Reading…";
  if (sg === "drafting") return "Drafting…";
  if (sg === "ready") return it.outreach ? "Ready" : it.kind === "message" ? "Ready to post" : undefined;
  if (sg === "needs") return "Needs a contact";
  if (sg === "sent") return it.agent === "promoter" ? "Applied" : "Sent";
  if (sg === "waiting") return "Waiting on a reply";
  if (sg === "follow") return "Follow-up ready";
  const m = ctx.state(it.id).mark;
  return m ? markLabel(m, it.agent) : undefined;
}

// ---- The page

export function ExecutivePlan(p: Props) {
  const { team, live } = p;
  const now = useNow();
  const plan = useMemo(() => execPlan(team), [team]);
  const state = useMemo(() => statesOf(team), [team]);
  const [tab, setTab] = useState<ExecTab>("now");
  const [pipe, setPipe] = useState<Pipe>();
  const [by, setBy] = useState<Partial<Record<ExecTab, Record<string, string>>>>({});
  const [openId, setOpenId] = useState<string>();
  const [shown, setShown] = useState(PAGE);

  if (!team.plan) return <Pending team={team} running={p.running} onOpen={p.onOpen} />;

  const x = team.exec;
  const run: Run | undefined = live.exec ? { queue: live.exec.queue, rows: live.exec.rows } : undefined;
  const stages = new Map(plan.items.map((it) => [it.id, stageOf(it, state(it.id), x, now, run)]));
  const stage = (it: ExecItem) => stages.get(it.id) ?? "ready";
  const crowds = [...new Set(plan.items.flatMap((i) => i.crowds))];
  const ctx: Ctx = { plan, team, state, stage, run, now, brand: p.brand, crowds, openId, setOpen: setOpenId, p };

  const newer = !team.plan.steps || planStale(team.plan, team.works);
  const unitemised = planUnitemised(team.plan, team.works);

  // The live counts: each number ticks as the run works.
  const targets = plan.items.filter((i) => i.outreach && !i.left);
  const cities = new Set(plan.items.filter((i) => !i.left).flatMap((i) => i.cities)).size;
  const reachable = new Set(targets.filter((i) => wayIn(contactOf(i, x))).map((i) => contactKey(i)!)).size;
  const pages = new Set(Object.values(x?.contacts ?? {}).flatMap((c) => c.pages ?? [])).size;
  // A draft counts once it can go out: one waiting on a contact sits under "Needs a contact" instead.
  const drafted = targets.filter((i) => x?.drafts[i.id] && !["queued", "reading", "drafting", "needs"].includes(stage(i))).length;
  const spent = Object.values(x?.spend ?? {}).reduce((s, v) => s + v.usd, 0);
  const counts: [number, string, string][] = [
    [targets.length, "target", "targets"],
    [cities, "city", "cities"],
    [reachable, "contact found", "contacts found"],
    ...(pages ? [[pages, "page read", "pages read"] as [number, string, string]] : []),
    [drafted, "draft ready", "drafts ready"],
  ];
  const piped = (k: Pipe) => targets.filter((i) => PIPE.find((s) => s.k === k)!.stages.includes(stage(i)));
  const pipeN = Object.fromEntries(PIPE.map((s) => [s.k, piped(s.k).length])) as Record<Pipe, number>;
  const firstReady = piped("ready")[0];

  const tabN = Object.fromEntries(EXEC_TABS.map((t) => [t, t === "results" ? plan.items.filter((i) => state(i.id).mark).length : tabItems(plan, t).filter((i) => t === "now" || !isChild(i, plan)).length])) as Record<ExecTab, number>;
  const tabs = EXEC_TABS.filter((t) => t === "now" || t === "results" || tabN[t] > 0);

  const pick = (t: ExecTab, f?: Record<string, string>) => {
    setTab(t);
    setPipe(undefined);
    setOpenId(undefined);
    setShown(PAGE);
    if (f) setBy({ ...by, [t]: f });
  };
  const base = tabItems(plan, tab).filter((i) => tab === "now" || !isChild(i, plan));
  const filt = by[tab] ?? {};
  const facets = new Map(base.map((it) => [it.id, filtersOf(it, tab)]));
  const list = base.filter((it) => Object.entries(filt).every(([f, v]) => !v || facets.get(it.id)?.[f]?.includes(v)));
  const filtering = Object.values(filt).some(Boolean);
  const needs = list.filter((i) => stage(i) === "needs");
  const main = list.filter((i) => stage(i) !== "needs");

  const row = (it: ExecItem, mixed = false) => <Row key={it.id} it={it} ctx={ctx} mixed={mixed} />;
  const more = (n: number) =>
    n > shown && (
      <button type="button" className="linkish small xp-more" onClick={() => setShown((s) => s + PAGE)}>
        Show {Math.min(PAGE, n - shown)} more of {n}
      </button>
    );

  const body = (): ReactNode => {
    if (pipe) {
      const its = piped(pipe);
      return (
        <>
          <ul className="xp-list">{its.slice(0, shown).map((it) => row(it, true))}</ul>
          {more(its.length)}
        </>
      );
    }
    if (tab === "results") return <Results plan={plan} team={team} />;
    if (tab === "now") return <NowSteps plan={plan} state={state} exec={x} list={main} filtering={filtering} disagreements={team.plan!.disagreements} row={row} onStartAnyway={p.onStartAnyway} />;
    const groups = groupsOf(tab, main, (city) => {
      const rep = tabItems(plan, "rep").filter((i) => i.cities.includes(city)).length;
      const promo = tabItems(plan, "promoter").filter((i) => !isChild(i, plan) && i.cities.includes(city)).length;
      if (!rep && !promo) return undefined;
      return (
        <span className="small muted xp-also-here">
          Also here:{" "}
          {rep > 0 && (
            <button type="button" className="linkish small" onClick={() => pick("rep", { City: city })}>
              {rep} Rep {rep === 1 ? "shop" : "shops"}
            </button>
          )}
          {rep > 0 && promo > 0 && " · "}
          {promo > 0 && (
            <button type="button" className="linkish small" onClick={() => pick("promoter", { Where: city })}>
              {promo} Promoter {promo === 1 ? "item" : "items"}
            </button>
          )}
        </span>
      );
    });
    let left = shown;
    const paged = groups.map((g) => ({ ...g, items: g.items.slice(0, Math.max(0, left)), _: (left -= Math.min(left, g.items.length)) })).filter((g) => g.items.length);
    return (
      <>
        {tab === "matchmaker" && <Bands items={base} by={filt} setBy={(f) => (setBy({ ...by, [tab]: f }), setShown(PAGE))} />}
        {paged.map((g) => (
          <section key={g.key} className="xp-group" aria-label={g.title}>
            {(g.title || g.aside) && (
              <header className="xp-group-head">
                {g.title && <h3 className="eyebrow">{g.title}</h3>}
                {g.aside}
              </header>
            )}
            <ul className="xp-list">{g.items.map((it) => row(it))}</ul>
          </section>
        ))}
        {more(main.length)}
        {!list.length && <p className="small muted">{filtering ? "Nothing here matches these filters." : "Nothing on this tab yet."}</p>}
      </>
    );
  };

  return (
    <section className="xp" aria-label="Execute Plan">
      <header className="xp-head">
        <span className="eyebrow">Execute Plan</span>
        <h2>{team.plan.headline}</h2>
        <p className="xp-counts small" aria-live="polite">
          {counts.map(([n, one, many], i) => (
            <span key={many}>
              {i > 0 && <span className="muted"> · </span>}
              <strong key={n} className="xp-tick">
                {n.toLocaleString("en-US")}
              </strong>{" "}
              {n === 1 ? one : many}
            </span>
          ))}
          {spent > 0 && (
            <span>
              <span className="muted"> · </span>
              {usd(spent)} spent{p.budget && <span className="muted"> of {p.budget}</span>}
            </span>
          )}
        </p>
        <div className="xp-pipe" role="group" aria-label="Where your outreach stands">
          {PIPE.filter((s) => s.k !== "follow" || pipeN.follow > 0).map((s) => (
            <button
              key={s.k}
              type="button"
              aria-pressed={pipe === s.k}
              className={pipe === s.k ? "on" : ""}
              disabled={!pipeN[s.k] && pipe !== s.k}
              onClick={() => {
                setPipe(pipe === s.k ? undefined : s.k);
                setOpenId(undefined);
                setShown(PAGE);
              }}
            >
              <strong key={pipeN[s.k]} className="xp-tick">
                {pipeN[s.k]}
              </strong>
              <span className="small">{s.label}</span>
            </button>
          ))}
        </div>
      </header>

      {(newer || unitemised) && (
        <div className="stale-flag">
          <span className="small">{!team.plan.steps ? "This plan was written before the numbered steps." : newer ? "A subagent has newer work than this plan." : "This plan was written before its steps named each shop, partner and event."}</span>{" "}
          <button type="button" className="linkish small" disabled={p.running} onClick={newer ? p.onUpdatePlan : p.onRewritePlan}>
            {p.running ? "Updating" : "Update the plan"}
          </button>
        </div>
      )}

      {live.exec ? (
        <div className="xp-banner xp-busy" role="status">
          <span className="xp-pulse" aria-hidden />
          <span className="small">{live.exec.line}</span>
        </div>
      ) : !x?.started && targets.length > 0 ? (
        <div className="xp-banner">
          <p className="small">
            The Executive finds how to reach all {targets.length} targets and writes the drafts. Nothing is sent: you send each one yourself.
          </p>
          <button type="button" className="primary" onClick={p.onStart}>
            Start
          </button>
        </div>
      ) : null}
      {firstReady && !pipe && (
        <p className="small muted xp-hint">
          Sent something or heard back? Tell Athena: “emailed {firstReady.name}” or “they said yes”.
        </p>
      )}

      {pipe ? (
        <p className="small xp-filtering">
          {PIPE.find((s) => s.k === pipe)!.label}: {pipeN[pipe]} across every subagent ·{" "}
          <button type="button" className="linkish small" onClick={() => setPipe(undefined)}>
            Show all
          </button>
        </p>
      ) : (
        <div className="xp-tabs" role="tablist" aria-label="Execute Plan">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => pick(t)}>
              {tabLabel(t)} <span className="xp-n">{tabN[t]}</span>
            </button>
          ))}
        </div>
      )}

      {!pipe && tab !== "results" && <Filters items={base} facets={facets} by={filt} hide={tab === "matchmaker" ? ["Band"] : []} setBy={(f) => (setBy({ ...by, [tab]: f }), setShown(PAGE))} />}
      {body()}

      {!pipe && tab !== "results" && needs.length > 0 && (
        <section className="xp-group xp-needs" aria-label="Needs a contact">
          <header className="xp-group-head">
            <h3 className="eyebrow">Needs a contact</h3>
            <span className="small muted">If you have a contact for any of these, tell Athena.</span>
          </header>
          <ul className="xp-list">{needs.map((it) => row(it))}</ul>
        </section>
      )}
    </section>
  );
}

type Group = { key: string; title?: string; aside?: ReactNode; items: ExecItem[] };

const GROUP_LABEL: Record<string, string> = {
  venue: "Shops",
  retailer: "Retail chains",
  cafe: "Cafes",
  bakery: "Bakeries",
  brunch: "Brunch spots",
  "gift shop": "Gift shops",
  partner: "Partners",
  creator: "Creators",
  podcast: "Podcasts",
  show: "Shows",
  message: "Hooks ready to post",
};
const labelOf = (g: string) => GROUP_LABEL[g] ?? cap(g);

/** Splits items into groups in first-seen order; one group needs no title. */
function split(items: ExecItem[], keyOf: (it: ExecItem) => string, order?: string[]): Group[] {
  const m = new Map<string, ExecItem[]>();
  for (const k of order ?? []) m.set(k, []);
  for (const it of items) (m.get(keyOf(it)) ?? m.set(keyOf(it), []).get(keyOf(it))!).push(it);
  const gs = [...m].filter(([, v]) => v.length).map(([k, v]) => ({ key: k, title: labelOf(k), items: v }));
  return gs.length > 1 ? gs : gs.map((g) => ({ ...g, title: undefined }));
}

/** Each subagent's own view: the Rep by shop type, the Matchmaker by kind, the Promoter by date, the Navigator by city,
 *  the Scout's hooks first. */
function groupsOf(tab: ExecTab, items: ExecItem[], alsoHere: (city: string) => ReactNode): Group[] {
  if (tab === "rep") return split(items, (it) => it.group ?? it.kind);
  if (tab === "matchmaker") return split(items, (it) => it.kind, ["partner", "creator", "podcast"]);
  if (tab === "scout") return split(items, (it) => it.kind, ["message", "show", "podcast", "creator"]).map((g) => (g.key === "message" ? { ...g, title: "Hooks ready to post" } : g));
  if (tab === "promoter") {
    const dated = items.filter((i) => dateOf(i.date)).sort((a, b) => dateOf(a.date)!.getTime() - dateOf(b.date)!.getTime());
    const online = items.filter((i) => !dateOf(i.date) && i.kind === "audience");
    const rest = items.filter((i) => !dateOf(i.date) && i.kind !== "audience");
    const months = new Map<string, ExecItem[]>();
    for (const it of dated) (months.get(monthOf(it.date)!) ?? months.set(monthOf(it.date)!, []).get(monthOf(it.date)!)!).push(it);
    return [...[...months].map(([m, v]) => ({ key: m, title: m, items: v })), { key: "online", title: "Online", items: online }, { key: "rest", title: "Also on the plan", items: rest }].filter((g) => g.items.length);
  }
  if (tab === "navigator") {
    const rank = (it: ExecItem) => (it.kind === "city" ? 0 : it.kind === "step" ? 1 : 2);
    const cities = new Map<string, ExecItem[]>();
    for (const it of items) (cities.get(it.cities[0] ?? "Anywhere") ?? cities.set(it.cities[0] ?? "Anywhere", []).get(it.cities[0] ?? "Anywhere")!).push(it);
    // Cities in plan order; what applies to every city comes last.
    return [...cities]
      .sort(([a], [b]) => Number(a === "Anywhere") - Number(b === "Anywhere"))
      .map(([c, v]) => ({ key: c, title: c, aside: c === "Anywhere" ? undefined : alsoHere(c), items: [...v].sort((a, b) => rank(a) - rank(b) || a.rank - b.rank) }));
  }
  return [{ key: "all", items }];
}

/** The Matchmaker's budget bands: each filters the list to partners and creators in it. */
function Bands({ items, by, setBy }: { items: ExecItem[]; by: Record<string, string>; setBy: (f: Record<string, string>) => void }) {
  const n = new Map<string, number>();
  for (const it of items) for (const b of it.facets.Band ?? []) if (!/unknown/i.test(b)) n.set(b, (n.get(b) ?? 0) + 1);
  if (n.size < 2) return null;
  return (
    <div className="xp-bands" role="group" aria-label="Budget bands">
      {[...n].map(([b, k]) => (
        <button key={b} type="button" aria-pressed={by.Band === b} className={by.Band === b ? "on" : ""} onClick={() => setBy({ ...by, Band: by.Band === b ? "" : b })}>
          {b} <span className="xp-n">{k}</span>
        </button>
      ))}
    </div>
  );
}

/** Before Athena has ordered the team's work: what will be here and when. */
function Pending({ team, running, onOpen }: { team: TeamState; running: boolean; onOpen: (id: Opens) => void }) {
  const left = team.workflow?.steps.filter((s) => s.id !== "athena" && s.state !== "done").map((s) => `the ${nameOf(s.id)}`) ?? [];
  return (
    <section className="xp xp-pending">
      <span className="eyebrow">Execute Plan</span>
      <p className="small muted">
        {!team.workflow ? (
          <>
            Execute Plan comes here once you{" "}
            <button type="button" className="linkish" onClick={() => onOpen("dashboard")}>
              build your growth plan
            </button>{" "}
            on the dashboard.
          </>
        ) : left.length ? (
          `Built once ${left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left.at(-1)} finish` : `${left[0]} finishes`} and Athena has put their work in order.`
        ) : running ? (
          "Athena is putting the team's work in order now."
        ) : (
          "Built as the workflow's last step."
        )}
      </p>
    </section>
  );
}

function Filters({ items, facets, by, hide, setBy }: { items: ExecItem[]; facets: Map<string, Record<string, string[]>>; by: Record<string, string>; hide: string[]; setBy: (f: Record<string, string>) => void }) {
  // Each filter offers what the others leave: pick a city and the neighbourhoods are that city's.
  const fits = (it: ExecItem, skip: string) => Object.entries(by).every(([f, v]) => !v || f === skip || (facets.get(it.id)?.[f] ?? []).includes(v));
  const values = new Map<string, Set<string>>();
  for (const it of items) for (const [f, vs] of Object.entries(facets.get(it.id) ?? {})) if (!hide.includes(f) && fits(it, f)) for (const v of vs) (values.get(f) ?? values.set(f, new Set()).get(f)!).add(v);
  for (const [f, v] of Object.entries(by)) if (v) values.get(f)?.add(v);
  const shown = [...values].filter(([, v]) => v.size > 1);
  if (!shown.length) return null;
  return (
    <div className="nav-facets xp-filters" role="group" aria-label="Filter">
      {shown.map(([f, vs]) => (
        <label key={f} className="small">
          <span className="muted">{f}</span>
          <select value={by[f] ?? ""} onChange={(e) => setBy({ ...by, [f]: e.target.value })}>
            <option value="">All</option>
            {[...vs].sort().map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

/** Now: Athena's steps in her order. A step that waits on another is greyed until it holds, or until started anyway. */
function NowSteps({ plan, state, exec, list, filtering, disagreements, row, onStartAnyway }: { plan: ExecPlan; state: (id: string) => ItemState; exec: TeamState["exec"]; list: ExecItem[]; filtering: boolean; disagreements: string[]; row: (it: ExecItem, mixed?: boolean) => ReactNode; onStartAnyway: (n: number) => void }) {
  const waits = waitingSteps(plan, state, exec);
  const ids = new Set(list.map((i) => i.id));
  const notes = new Set(plan.steps.flatMap((s) => s.notes ?? []));
  const left = disagreements.filter((d) => !notes.has(d));
  const what = (n: number) => plan.steps.find((s) => s.n === n)?.what ?? "";
  let phase: string | undefined;
  if (!plan.steps.length) return <p className="small muted">Athena&apos;s plan has no steps yet. Update it above to fill Now.</p>;
  return (
    <div className="xp-now">
      {plan.steps.map((s) => {
        const rows = plan.items.filter((i) => i.now?.step === s.n && ids.has(i.id)).sort((a, b) => a.now!.order - b.now!.order);
        if (filtering && !rows.length) return null;
        const also = s.items.map((id) => plan.byId.get(id)).filter((i): i is ExecItem => !!i && i.now?.step !== s.n);
        const on = waits.get(s.n);
        const head = s.phase !== phase ? (s.phase === "shared" ? "Shared moves" : TIER_LABEL[s.phase]) : undefined;
        phase = s.phase;
        return (
          <section key={s.n} className={`xp-step${on ? " xp-waiting" : ""}`} aria-label={s.what}>
            {head && <p className="eyebrow xp-phase">{head}</p>}
            <header className="xp-step-head">
              <h3>{s.what}</h3>
              {(s.crowds.length > 0 || s.needs) && (
                <p className="small muted">
                  {s.crowds.length > 0 && `For ${and(s.crowds)}`}
                  {s.crowds.length > 0 && s.needs && " · "}
                  {s.needs}
                </p>
              )}
              {on && (
                <p className="small xp-once">
                  Starts after {and(on.map((n) => `“${what(n)}”`))}.{" "}
                  <button type="button" className="linkish small" onClick={() => onStartAnyway(s.n)}>
                    Start anyway
                  </button>
                </p>
              )}
              {s.notes?.map((n) => (
                <p key={n} className="small xp-note">
                  {n}
                </p>
              ))}
            </header>
            {rows.length > 0 && <ul className="xp-list">{rows.map((it) => row(it, true))}</ul>}
            {also.length > 0 && <p className="small muted xp-also">Also uses: {and(also.map((i) => i.name))}</p>}
          </section>
        );
      })}
      {left.length > 0 && !filtering && (
        <section className="xp-step">
          <p className="eyebrow xp-phase">Where the subagents disagree</p>
          {left.map((d) => (
            <p key={d} className="small xp-note">
              {d}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

const ICON_PATH: Record<"address" | "website" | "phone" | "email" | "dm", ReactNode> = {
  address: (
    <>
      <path d="M8 1.8a4.2 4.2 0 0 0-4.2 4.2c0 3.2 4.2 8.2 4.2 8.2s4.2-5 4.2-8.2A4.2 4.2 0 0 0 8 1.8Z" />
      <circle cx="8" cy="6" r="1.5" />
    </>
  ),
  website: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14c-1.8-1.7-2.6-3.7-2.6-6S6.2 3.7 8 2Z" />
    </>
  ),
  phone: <path d="M4.2 2h2l1 3-1.4 1a7.5 7.5 0 0 0 4.2 4.2l1-1.4 3 1v2a1.6 1.6 0 0 1-1.7 1.6A11.4 11.4 0 0 1 2.6 3.7 1.6 1.6 0 0 1 4.2 2Z" />,
  email: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="m2.5 4.5 5.5 4.3 5.5-4.3" />
    </>
  ),
  dm: <path d="M3.5 3h9A1.5 1.5 0 0 1 14 4.5v5.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5v-2.5h-.5A1.5 1.5 0 0 1 2 10V4.5A1.5 1.5 0 0 1 3.5 3Z" />,
};
const ICON_NAME = { address: "address", website: "website", phone: "phone", email: "email", dm: "DM or form" } as const;

/** Contact icons: filled when found, hollow when looked for and not published, absent before any lookup. */
function Icons({ icons }: { icons: ReturnType<typeof iconsOf> }) {
  const shown = (Object.entries(icons) as [keyof typeof ICON_PATH, Icon][]).filter(([, v]) => v !== "unknown");
  if (!shown.length) return null;
  const said = shown.map(([k, v]) => `${ICON_NAME[k]} ${v === "found" ? "found" : "not published"}`).join(", ");
  return (
    <span className="xp-icons" role="img" aria-label={`Contact: ${said}`} title={said}>
      {shown.map(([k, v]) => (
        <svg key={k} viewBox="0 0 16 16" className={`xp-icon ${v}`} aria-hidden>
          {ICON_PATH[k]}
        </svg>
      ))}
    </span>
  );
}

/** A dated item's day, as a chip at the row's start. */
function DateChip({ d }: { d: string }) {
  const t = dateOf(d);
  if (!t) return null;
  return (
    <span className="xp-date" aria-label={t.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}>
      <span>{t.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</span>
      <strong>{t.getUTCDate()}</strong>
    </span>
  );
}

/** One live task: its action, its evidence and its crowds, its contact icons and where it stands. It opens in place. */
function Row({ it, ctx, mixed }: { it: ExecItem; ctx: Ctx; mixed?: boolean }) {
  const sg = ctx.stage(it);
  const c = contactOf(it, ctx.team.exec);
  const open = ctx.openId === it.id;
  const sub = [mixed ? owner(it) : undefined, it.cities[0], evidenceOf(it, ctx.plan), it.left ? "No longer on its page" : undefined].filter(Boolean).join(" · ");
  const crowdLine = forOf(it, ctx.crowds);
  const text = stageText(sg, it, ctx);
  return (
    <li className={`xp-row xp-st-${sg}${sg === "reading" || sg === "drafting" ? " xp-live" : ""}${it.left ? " xp-left" : ""}${open ? " xp-open" : ""}`}>
      <button type="button" className="xp-row-head" aria-expanded={open} onClick={() => ctx.setOpen(open ? undefined : it.id)}>
        {it.date && <DateChip d={it.date} />}
        <span className="xp-main">
          <span className="xp-act">{it.action}</span>
          {sub && <span className="xp-sub small muted">{sub}</span>}
          {crowdLine && <span className="xp-for small muted">{crowdLine}</span>}
        </span>
        {it.outreach && <Icons icons={iconsOf(c, it.kind)} />}
        {text && <span className={`xp-stage small xp-stage-${sg}`}>{text}</span>}
      </button>
      {open && <Opened it={it} ctx={ctx} c={c} />}
    </li>
  );
}

// ---- An opened row

const LINKED = new Set(["website", "contact form", "apply", "partnerships page", "instagram", "x", "twitter", "tiktok", "youtube", "facebook", "linkedin", "threads", "twitch", "profile"]);
const HIDDEN_FACTS = new Set(["Address", "Phone", "Hours", "Rating", "Contact", "Buyer contact", "Email", "Found by", "Neighbourhood", "When", "For", "Owner"]);

function Opened({ it, ctx, c }: { it: ExecItem; ctx: Ctx; c?: ContactView }) {
  const { p } = ctx;
  const others = it.agents.filter((a) => a !== it.agent);
  const drafts = it.outreach || it.kind === "message";
  return (
    <div className={`xp-body${drafts ? " xp-two" : ""}`}>
      <div className="xp-col">
        <Why it={it} ctx={ctx} />
        {it.outreach && <How it={it} ctx={ctx} c={c} />}
        {it.outreach && <Reach it={it} ctx={ctx} c={c} />}
      </div>
      {drafts && (
        <div className="xp-col">
          <DraftsView it={it} ctx={ctx} c={c} />
        </div>
      )}
      <History it={it} ctx={ctx} c={c} />
      <p className="xp-foot small">
        <button type="button" className="linkish small" onClick={() => p.onAsk(it)}>
          Ask Athena about this
        </button>
        {it.agent !== "athena" && (
          <>
            <span className="muted"> · </span>
            <button type="button" className="linkish small" onClick={() => p.onOpen(it.agent as SpecialistId)}>
              Open the {nameOf(it.agent as SpecialistId)}
            </button>
          </>
        )}
        {others.length > 0 && <span className="muted"> · Also listed by {and(others.map((a) => `the ${nameOf(a)}`))}</span>}
      </p>
    </div>
  );
}

/** The "Fit for <crowd>" facts as one: "Strong for all three crowds", or "Strong for A · Good for B". */
function fitOf(it: ExecItem, all: string[]): string | undefined {
  const by = new Map<string, string[]>();
  for (const f of it.detail?.facts ?? []) {
    if (!/^fit for /i.test(f.label) || UNKNOWN.test(f.value)) continue;
    // A bare strength (saved by a run before the Matchmaker wrote words) reads as its word.
    const word = /^[\d.]+$/.test(f.value.trim()) ? strengthWord(Number(f.value)) : f.value.split(" (")[0].trim();
    by.set(word, [...(by.get(word) ?? []), f.label.slice(8)]);
  }
  const whom = (cs: string[]) => (all.length > 1 && cs.length === all.length ? (all.length === 2 ? "both crowds" : `all ${["", "", "", "three", "four", "five"][all.length] ?? all.length} crowds`) : and(cs));
  return [...by].map(([w, cs]) => `${w} for ${whom(cs)}`).join(" · ") || undefined;
}

/** A note that only says where it is and which crowds it fits: the row's own lines already say both. */
const restates = (note: string) => /^[^:]{1,60}: fits [^:]+$/.test(note);

/** Why it's on the plan: the owner's reason and its facts, in a few lines, without what the row already says. */
function Why({ it, ctx }: { it: ExecItem; ctx: Ctx }) {
  const d = it.detail;
  const fit = fitOf(it, ctx.crowds);
  const shown = new Set((evidenceOf(it, ctx.plan) ?? "").split(" · ").filter(Boolean));
  const onRow = (v: string) => [...shown].some((e) => e.includes(v));
  // "Format: A bundle or a shared giveaway (also: …)" when the row already says the offer: only the other formats.
  const rest = (f: { label: string; value: string }) => {
    const e = [...shown].find((s) => f.value.startsWith(s));
    const also = e ? /^\s*\(also: (.+)\)$/.exec(f.value.slice(e.length)) : null;
    if (!e || !also) return f;
    const others = also[1].split(", ").filter((x) => !e.toLowerCase().includes(x.toLowerCase()));
    return others.length ? { label: `Other ${f.label.toLowerCase()}s`, value: others.join(", ") } : undefined;
  };
  const facts = [
    ...(fit ? [{ label: "Fit", value: fit }] : []),
    ...(d?.facts ?? []).filter((f) => !HIDDEN_FACTS.has(f.label) && !/^fit for /i.test(f.label) && !(f.label === "Where" && it.kind !== "event") && f.value !== "Ask" && !UNKNOWN.test(f.value) && !onRow(f.value)).flatMap((f) => rest(f) ?? []),
  ].slice(0, 6);
  const lines = (d?.lines ?? []).filter((l) => !shown.has(l) && !/: one pitch reaches \d+ crowds$/.test(l)).slice(0, 3);
  const links = (d?.links ?? []).filter((l) => !LINKED.has(l.label.toLowerCase()));
  const kids = ctx.plan.items.filter((k) => k.parent === it.id);
  const step = ctx.plan.steps.find((s) => s.n === it.now?.step);
  const text = it.kind === "message" || !it.note || restates(it.note) ? undefined : it.note;
  if (!text && !facts.length && !lines.length && !links.length && !kids.length && !step) return null;
  return (
    <div className="xp-sec">
      <p className="crowd-label">Why it&apos;s on the plan</p>
      {text && <p className="small">{text}</p>}
      {facts.length > 0 && (
        <dl className="xp-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="small muted">{f.label}</dt>
              <dd className="small">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {lines.map((l) => (
        <p key={l} className="small">
          {l}
        </p>
      ))}
      {kids.length > 0 && (
        <ul className="xp-kids small">
          {kids.map((k) => (
            <li key={k.id} className={ctx.state(k.id).status === "done" ? "done" : ""}>
              {k.name}
            </li>
          ))}
        </ul>
      )}
      {(links.length > 0 || step) && (
        <p className="small muted xp-links">
          {step && <span>In Now: {step.what}</span>}
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

/** How the Executive dealt with it: the pages it read, each a small link. */
function How({ it, ctx, c }: { it: ExecItem; ctx: Ctx; c?: ContactView }) {
  const [all, setAll] = useState(false);
  const key = contactKey(it);
  const found = key ? ctx.team.exec?.contacts[key] : undefined;
  const pages = found?.pages ?? [];
  const sg = ctx.stage(it);
  let say: ReactNode;
  if (sg === "reading" || sg === "drafting") say = stageText(sg, it, ctx);
  else if (pages.length)
    say = (
      <>
        Read {pages.length === 1 ? "1 page" : `${pages.length} pages`}:{" "}
        {(all ? pages : pages.slice(0, 6)).map((u) => (
          <a key={u} className="xp-page" href={u} target="_blank" rel="noopener noreferrer">
            {shortUrl(u)}
          </a>
        ))}
        {!all && pages.length > 6 && (
          <button type="button" className="linkish small" onClick={() => setAll(true)}>
            {pages.length - 6} more
          </button>
        )}
      </>
    );
  else if (c?.yours) say = "From you.";
  else if (sg === "queued") say = stageText(sg, it, ctx) === "Waits on Start" ? "Waits on Start." : `Queued: ${stageText(sg, it, ctx)}.`;
  else if (found) say = `Looked up ${day(found.at)}.`;
  else say = `From the ${owner(it)}'s page.`;
  return (
    <div className="xp-sec">
      <p className="crowd-label">How we found them</p>
      <p className="small xp-pages">{say}</p>
    </div>
  );
}

/** A source as a short link on its field: Qloo, the Rep, you, or the page's host. */
function srcLabel(s: Src, value?: string) {
  if (/qloo/i.test(s.label)) return "Qloo";
  if (/^found by /i.test(s.label)) return s.label.slice(9);
  if (s.label === "From you") return "you";
  if (s.url && s.url !== value) return hostOf(s.url);
  return s.label.length > 24 ? `${s.label.slice(0, 22)}…` : s.label;
}
function SrcLink({ s, value }: { s: Src; value?: string }) {
  const label = srcLabel(s, value);
  return s.url ? (
    <a className="xp-src" href={s.url} target="_blank" rel="noopener noreferrer" title={s.label}>
      {label}
    </a>
  ) : (
    <span className="xp-src" title={s.label}>
      {label}
    </span>
  );
}

/** A US phone number as people write it, (212) 245-0072; anything else stays as found. */
function phoneOf(v: string) {
  const m = /^1?(\d{3})(\d{3})(\d{4})$/.exec(v.replace(/\D/g, ""));
  return m && !/[a-z]/i.test(v) ? `(${m[1]}) ${m[2]}-${m[3]}` : v;
}

const maps = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** "Open on Instagram", TikTok or YouTube: a profile Athena's server saw on a page of theirs, or the founder gave, with
 *  that page as its source (§23.5 r). */
function ProfileButtons({ c, onClick }: { c?: ContactView; onClick?: () => void }) {
  return (
    <>
      {profileButtons(c).map((b) => (
        <span key={b.url} className="xp-profile">
          <a className="button" href={b.url} target="_blank" rel="noopener noreferrer" onClick={onClick}>
            Open on {b.site}
          </a>
          <SrcLink s={b.src} />
        </span>
      ))}
    </>
  );
}

/** The DM links that aren't a profile button: X, Facebook…, and a profile the server hasn't seen on a page of theirs. */
const restOf = (c?: ContactView) => {
  const shown = new Set(profileButtons(c).map((b) => b.url));
  return (c?.social ?? []).filter((s) => !shown.has(profileOf(s.value)?.url ?? ""));
};

/** The ways to reach them, each with its source as a small link. */
function Reach({ it, ctx, c }: { it: ExecItem; ctx: Ctx; c?: ContactView }) {
  const drafted = !!ctx.team.exec?.drafts[it.id];
  const opened = () => drafted && ctx.p.onOpened(it.id);
  const sg = ctx.stage(it);
  if (!c) return null;
  const formLabel = it.kind === "event" || it.kind === "retailer" ? "Apply" : "Contact form";
  const fields: { k: string; label: string; v: string; href?: string; src: Src; raw: string }[] = [];
  if (c.email) fields.push({ k: "email", label: "Email", v: c.email.value, href: `mailto:${c.email.value}`, src: c.email.src, raw: c.email.value });
  if (c.phone) fields.push({ k: "phone", label: "Phone", v: phoneOf(c.phone.value), href: `tel:${c.phone.value.replace(/[^\d+]/g, "")}`, src: c.phone.src, raw: c.phone.value });
  if (c.address) fields.push({ k: "address", label: "Address", v: c.address.value, href: maps(c.address.value), src: c.address.src, raw: c.address.value });
  if (c.form) fields.push({ k: "form", label: formLabel, v: formLabel === "Apply" ? "Open the application" : "Open their form", href: c.form.value, src: c.form.src, raw: c.form.value });
  if (c.website) fields.push({ k: "website", label: "Website", v: shortUrl(c.website.value), href: c.website.value, src: c.website.src, raw: c.website.value });
  const rest = restOf(c);
  const queuedish = sg === "queued" || sg === "reading" || sg === "drafting";
  return (
    <div className="xp-sec">
      <p className="crowd-label">Ways to reach them</p>
      {fields.length > 0 && (
        <dl className="xp-fields">
          {fields.map((f) => (
            <div key={f.k}>
              <dt className="small muted">{f.label}</dt>
              <dd className="small">
                {f.href ? (
                  <a href={f.href} target={f.k === "email" || f.k === "phone" ? undefined : "_blank"} rel="noopener noreferrer" onClick={f.k === "form" ? opened : undefined}>
                    {f.v}
                  </a>
                ) : (
                  f.v
                )}{" "}
                {/* A site read on its own pages is its own source: "pepsi.com pepsi.com" says nothing twice. */}
                {!(f.k === "website" && f.src.url && hostOf(f.src.url) === hostOf(f.raw)) && <SrcLink s={f.src} value={f.raw} />}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(profileButtons(c).length > 0 || rest.length > 0) && (
        <div className="xp-dms">
          <ProfileButtons c={c} onClick={opened} />
          {rest.map((s) => (
            <span key={s.value} className="xp-dm small">
              <a href={s.value} target="_blank" rel="noopener noreferrer" onClick={opened}>
                {s.label}
              </a>{" "}
              <SrcLink s={s.src} value={s.value} />
            </span>
          ))}
        </div>
      )}
      {sg === "needs" && <p className="small muted">If you have a way to reach them, tell Athena.</p>}
      {!fields.length && !c.social.length && queuedish && <p className="small muted">Found as the Executive reaches them.</p>}
    </div>
  );
}

type Ch = "email" | "dm" | "call";
/** The drafts' order: the best way in first. A creator or a partner with a profile is a DM first. */
function channelsOf(it: ExecItem, c?: ContactView): Ch[] {
  const dm = !!c?.social.length;
  const best: Ch = (it.kind === "creator" || it.kind === "partner") && dm ? "dm" : c?.email || c?.form ? "email" : dm ? "dm" : c?.phone || c?.address ? "call" : "email";
  const all: Ch[] = ["email", "dm"];
  if (!isPerson(it.kind) || c?.phone) all.push("call");
  return [best, ...all.filter((k) => k !== best)];
}

/** The drafts, best channel first, each with Copy and tones. Nothing is sent from here. */
function DraftsView({ it, ctx, c }: { it: ExecItem; ctx: Ctx; c?: ContactView }) {
  const x = ctx.team.exec;
  const d: Drafts | undefined = x?.drafts[it.id];
  const chans = channelsOf(it, c);
  const [ch, setCh] = useState<Ch>(chans[0]);
  const [first, setFirst] = useState(false);
  const sg = ctx.stage(it);
  const names = [it.name, ctx.brand, ...(it.detail?.draft?.names ?? [])];
  const opened = () => ctx.p.onOpened(it.id);
  const walk = x?.prefs?.phoneOnly === "walk" || (!c?.phone && !!c?.address);

  if (it.kind === "message")
    return (
      <div className="xp-sec">
        <p className="crowd-label">The hook</p>
        <Draft key={it.name} body={it.name} kind="hook" names={[ctx.brand]} />
      </div>
    );
  if (!d) {
    const own = it.detail?.draft;
    return (
      <div className="xp-sec">
        <p className="crowd-label">Drafts</p>
        {own && <Draft key={own.body} subject={own.subject ?? `${ctx.brand} for ${it.name}`} body={own.body} kind="email" names={names} to={c?.email?.value} onOpened={opened} />}
        <p className="small muted">{x?.started ? "The Executive writes the email, DM and call script when its turn comes." : "The Executive writes the email, DM and call script once you start it."}</p>
      </div>
    );
  }
  const up = sg === "follow" && !first ? followUpDraft(d, it, { name: ctx.brand }) : undefined;
  const email = up ?? d.email;
  const label = (k: Ch) => (k === "email" ? (c?.email || !c?.form ? "Email" : "Email or form") : k === "dm" ? "DM" : walk ? "Walk-in script" : "Call script");
  const call = d.call;
  const script = `Opener: ${call.opener}\nWhy them: ${call.why}\nThe offer: ${call.offer}\nIf they say "send me something": ${call.send}\nClose: ${call.close}`;
  const prof = profileButtons(c)[0];
  return (
    <div className="xp-sec">
      <span className="seg xp-draft-kind" role="tablist" aria-label="Drafts">
        {chans.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={ch === k} className={ch === k ? "on" : ""} onClick={() => setCh(k)}>
            {label(k)}
          </button>
        ))}
      </span>
      {ch === "email" && (
        <>
          {sg === "follow" && (
            <p className="small">
              {up ? "The follow-up, ready to send. " : "The first email. "}
              <button type="button" className="linkish small" onClick={() => setFirst(!first)}>
                {up ? "See the first email" : "Back to the follow-up"}
              </button>
            </p>
          )}
          <Draft key={email.body} subject={email.subject} body={email.body} kind="email" names={names} to={c?.email?.value} form={c?.email ? undefined : c?.form?.value} onOpened={opened} />
        </>
      )}
      {ch === "dm" && (
        <Draft key={d.dm} body={d.dm} kind="dm" names={names}>
          {prof && <CopyOpen text={d.dm} url={prof.url} site={prof.site} onOpened={opened} />}
        </Draft>
      )}
      {ch === "call" && (
        <div className="nav-draft">
          <dl className="xp-script">
            {(
              [
                ["Opener", call.opener],
                ["Why them", call.why],
                ["The offer", call.offer],
                ["If they say “send me something”", call.send],
                ["Close", call.close],
              ] as const
            ).map(([l, v]) => (
              <div key={l}>
                <dt className="small muted">{l}</dt>
                <dd className="small">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="nav-draft-acts">
            <CopyButton text={script} />
            {!walk && c?.phone && (
              <a className="button" href={`tel:${c.phone.value.replace(/[^\d+]/g, "")}`}>
                Call {phoneOf(c.phone.value)}
              </a>
            )}
            {walk && c?.address && (
              <a className="button" href={maps(c.address.value)} target="_blank" rel="noopener noreferrer">
                Directions
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => void copy(text).then((ok) => ok && (setDone(true), setTimeout(() => setDone(false), 1600)))}>
      {done ? "Copied" : label}
    </button>
  );
}

/** Copies the DM, then opens their profile to paste it. */
function CopyOpen({ text, url, site, onOpened }: { text: string; url: string; site: string; onOpened: () => void }) {
  return (
    <a
      className="button"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        void copy(text);
        onOpened();
      }}
    >
      Copy and open {site}
    </a>
  );
}

const mailto = (to: string | undefined, subject: string, body: string) => `mailto:${to ? encodeURIComponent(to) : ""}?${new URLSearchParams({ subject, body }).toString().replace(/\+/g, "%20")}`;

/** A draft with its tones and Copy; an email also opens in the mail app, or their form when there's no email. */
function Draft({ subject, body, kind, names, to, form, onOpened, children }: { subject?: string; body: string; kind: "email" | "dm" | "hook"; names: string[]; to?: string; form?: string; onOpened?: () => void; children?: ReactNode }) {
  const [d, setD] = useState({ subject, body });
  const [busy, setBusy] = useState<string>();
  const retone = async (tone: string) => {
    setBusy(tone);
    try {
      const r = await fetch("/api/draft/tone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(d.subject ? { subject: d.subject } : {}), body: d.body, tone, names, kind }) });
      const j = (await r.json().catch(() => ({}))) as { subject?: string; body?: string };
      if (r.ok && j.body) setD({ subject: j.subject || d.subject, body: j.body });
    } catch {
      // The draft stays as it was.
    } finally {
      setBusy(undefined);
    }
  };
  const text = kind === "email" && d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;
  return (
    <div className="nav-draft">
      {kind === "email" && to && <p className="small muted">To {to}</p>}
      {kind === "email" && d.subject && (
        <p className="small">
          <strong>{d.subject}</strong>
        </p>
      )}
      <pre className="nav-draft-body">{d.body}</pre>
      <div className="nav-draft-acts nav-draft-tones">
        {TONES.map((t) => (
          <button key={t} type="button" disabled={!!busy} onClick={() => retone(t)}>
            {busy === t ? "Rewriting…" : t}
          </button>
        ))}
        {d.body !== body && (
          <button type="button" disabled={!!busy} onClick={() => setD({ subject, body })}>
            As first written
          </button>
        )}
      </div>
      <div className="nav-draft-acts">
        <CopyButton text={text} />
        {kind === "email" && (to || !form) && (
          <a className="button" href={mailto(to, d.subject ?? "", d.body)} onClick={onOpened}>
            Open in mail app
          </a>
        )}
        {kind === "email" && !to && form && (
          <a className="button" href={form} target="_blank" rel="noopener noreferrer" onClick={() => (void copy(d.body), onOpened?.())}>
            Copy and open their form
          </a>
        )}
        {children}
      </div>
    </div>
  );
}

/** What the founder and the Executive did with it, on one line, at the real times. */
function History({ it, ctx, c }: { it: ExecItem; ctx: Ctx; c?: ContactView }) {
  const x = ctx.team.exec;
  const ev: { at: number; text: string }[] = [];
  const found = c && x?.contacts[c.key];
  if (found) ev.push({ at: found.at, text: "Looked up" });
  const yours = c && x?.yours?.[c.key];
  if (yours) ev.push({ at: yours.at, text: "Contact from you" });
  if (x?.drafts[it.id]) ev.push({ at: x.drafts[it.id].at, text: "Drafts written" });
  if (x?.opened?.[it.id]) ev.push({ at: x.opened[it.id], text: "Opened" });
  for (const o of ctx.team.outcomes) if (o.item === it.id) ev.push({ at: o.at, text: markLabel(o.mark, o.agent) });
  if (!ev.length) return null;
  return (
    <p className="small muted xp-history">
      {ev
        .sort((a, b) => a.at - b.at)
        .map((e) => `${e.text} ${day(e.at)}`)
        .join(" · ")}
    </p>
  );
}

/** What's working, per subagent: each line goes back to the subagent that re-ranks from it. */
function Results({ plan, team }: { plan: ExecPlan; team: TeamState }) {
  const lines = resultsOf(plan, team);
  const spend = Object.entries(team.exec?.spend ?? {});
  if (!lines.length && !spend.length) return <p className="small muted">Results come in as you tell Athena what happened. Each Sent, Yes and No goes back to the subagent that found it, which re-ranks from it.</p>;
  const agents = [...new Set(lines.map((l) => l.agent))];
  const spent = (a: SpecialistId) => spend.filter(([id]) => plan.byId.get(id)?.agent === a).reduce((s, [, v]) => s + v.usd, 0);
  return (
    <div className="xp-results">
      {agents.map((a) => (
        <section key={a} className="xp-result">
          <h3>The {nameOf(a)}</h3>
          <ul>
            {lines
              .filter((l) => l.agent === a)
              .slice(0, 12)
              .map((l) => {
                const parts = [l.yes && `${l.yes} ${markLabel("yes", a).toLowerCase()}`, l.went && `${l.went} went`, l.no && `${l.no} ${markLabel("no", a).toLowerCase()}`, l.waiting && `${l.waiting} waiting`].filter(Boolean);
                return (
                  <li key={`${l.by}|${l.value}`} className="small">
                    <span className="muted">{l.by}:</span> <strong>{l.value}</strong> · {parts.join(", ")} <span className="muted">of {l.of}</span>
                  </li>
                );
              })}
          </ul>
          {spent(a) > 0 && <p className="small">Spent {usd(spent(a))}</p>}
          <p className="small muted">The {nameOf(a)} re-ranks from these on its next run.</p>
        </section>
      ))}
    </div>
  );
}
