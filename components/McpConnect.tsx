"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { workspace } from "@/lib/knowledge/workspace";
import { NavIcon } from "./SideNav";
import { BRAND_FILE, brandFile } from "@/lib/workspace/brand-file";
import { CAL_FILE, calendarFile } from "@/lib/workspace/calendar";
import { PLAN_FILE, XLSX_TYPE, planWorkbook } from "@/lib/workspace/plan-sheets";

// Two quiet sidebar rows below Subagents (PRD §23.6 d), each opening the frosted side panel (a full-screen sheet on a
// phone), split by where the plan goes.
// "Connect with Athena MCP", from the end of onboarding: a server URL to paste into Claude, Claude Code, Cursor or
// ChatGPT, with three short steps for the chosen tool and New link to rotate it, and athena-brand.md (f), the same
// context as a file for a tool that can't connect. The link is the founder's own connect link (§23.6 c): the server
// keeps only its hash, so the browser remembers the secret it was shown and only New link changes it.
// "Share your plan", once the plan is written: athena-plan.xlsx, the Calendar (g: Subscribe to a live feed on its own
// calendar-only link, or Download a one-off .ics), Share with your team (k: a view-only Execute Plan on its own
// share-only link) and the Monday email (j). "In your calendar" lines elsewhere open it at the Calendar (MCP_EVENT).
// One job per link, and none is ever minted over a live one this browser lost without the founder's New link.
// The same panel opens from /plan's first screen on the judges' demo (§23.6 e), with both panels behind one switch:
// fixed, read-only links to the precomputed Fishwife plan and no New link (rotating a shared link breaks it for all).

const JOURNEY_KEY = "athena:journey:v1"; // the journey as components/Journey.tsx saves it: { brief, journey, … }
const LINK_EVENT = "athena:link"; // a new link, so every copy on the page shows it, never a revoked one
/** The demo's links: one fixed, read-only secret for every kind (lib/workspace/demo.ts). */
const DEMO_SECRET = "fishwife-sample-plan";

/** Opens a panel from anywhere: detail "share" opens Share your plan, "calendar" opens it at its Calendar, anything else Connect with Athena MCP. */
export const MCP_EVENT = "athena:mcp";

/** A one-line "In your calendar" link, for a dated item on the Promoter's calendar or an Execute Plan row (§23.6 g). */
export function InYourCalendar() {
  return (
    <button type="button" className="linkish small in-cal" onClick={() => window.dispatchEvent(new CustomEvent(MCP_EVENT, { detail: "calendar" }))}>
      In your calendar
    </button>
  );
}

/* ── The founder's links ─────────────────────────────────────────────────────────────────────────────────────── */

/** "full": the MCP link, the only one that can change anything. "cal": the calendar feed. "share": the team's page. */
type Kind = "full" | "cal" | "share";
const KINDS: Kind[] = ["full", "cal", "share"];
/** The secret this browser was shown for each kind, so the panel shows the same link each time. */
const KEY: Record<Kind, string> = { full: "athena:link:full", cal: "athena:link:cal", share: "athena:link:share" };
const PATH: Record<Kind, (secret: string) => string> = { full: (s) => `/mcp/${s}`, cal: (s) => `/cal/${s}.ics`, share: (s) => `/share/${s}` };

const stored = (kind: Kind) => {
  try {
    return localStorage.getItem(KEY[kind]) ?? "";
  } catch {
    return "";
  }
};

/** Mints a link (the server revokes the one before), keeps its secret, and tells every copy on the page. */
async function mintLink(kind: Kind): Promise<string> {
  try {
    const res = await fetch("/api/workspace/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws: workspace(), scope: kind }) });
    const j = (await res.json()) as { ok?: boolean; path?: string };
    const secret = j.ok && j.path ? j.path.replace(/^\/(mcp|cal|share)\//, "").replace(/\.ics$/, "") : "";
    if (secret) {
      try {
        localStorage.setItem(KEY[kind], secret);
      } catch {
        // Storage unavailable: the link still works this visit.
      }
      window.dispatchEvent(new CustomEvent(LINK_EVENT, { detail: { kind, secret } }));
    }
    return secret;
  } catch {
    return "";
  }
}

/** The first link of a kind, asked for once however many copies want it at the same time (the panel and the
 *  dashboard). If the server already has a live one, this browser lost the secret it was shown: that link may be in
 *  a co-founder's chat or a calendar app, so it's never replaced without the founder's New link (§23.6 d). */
const firsts: Partial<Record<Kind, Promise<{ secret?: string; lost?: boolean }>>> = {};
function firstLink(kind: Kind) {
  return (firsts[kind] ??= (async () => {
    try {
      const j = (await (await fetch(`/api/workspace/link?ws=${encodeURIComponent(workspace())}&scope=${kind}`)).json()) as { ok?: boolean; exists?: boolean };
      if (!j.ok) return {};
      if (j.exists) return { lost: true };
    } catch {
      return {};
    }
    return { secret: await mintLink(kind) };
  })().finally(() => delete firsts[kind]));
}

/** A new brand in this browser (Start over, a sample, ?new=1): revoke the old brand's links, so a co-founder or a
 *  calendar holding one reads "replaced", never the new brand's plan, and forget them here (§23.6 d). */
export function dropLinks() {
  try {
    if (!KINDS.some(stored) && !localStorage.getItem(JOURNEY_KEY)) return;
    const ws = workspace();
    for (const kind of KINDS) {
      void fetch(`/api/workspace/link?ws=${encodeURIComponent(ws)}&scope=${kind}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
      localStorage.removeItem(KEY[kind]);
    }
  } catch {
    // Storage unavailable: nothing was kept here to drop.
  }
}

type LinkState = { url: string; state: "busy" | "ready" | "lost" | "none"; renew: () => Promise<boolean> };

/** One link: this browser's, else a first one made when it's first shown (`on`); `fixed` is the demo's URL. */
function useLink(kind: Kind, fixed?: string, on = true): LinkState {
  const [secret, setSecret] = useState("");
  const [state, setState] = useState<LinkState["state"]>("busy");
  useEffect(() => {
    if (fixed || !on) return;
    let live = true;
    const next = (e: Event) => {
      const d = (e as CustomEvent<{ kind: Kind; secret: string }>).detail;
      if (d?.kind === kind) (setSecret(d.secret), setState("ready"));
    };
    window.addEventListener(LINK_EVENT, next);
    const have = stored(kind);
    if (have) (setSecret(have), setState("ready"));
    else {
      setState("busy");
      firstLink(kind).then((r) => live && (r.secret ? (setSecret(r.secret), setState("ready")) : setState(r.lost ? "lost" : "none")));
    }
    return () => {
      live = false;
      window.removeEventListener(LINK_EVENT, next);
    };
  }, [kind, fixed, on]);
  const renew = useCallback(async () => {
    setState("busy");
    const s = await mintLink(kind);
    if (s) setSecret(s);
    setState(s ? "ready" : "none");
    return !!s;
  }, [kind]);
  if (fixed) return { url: fixed, state: "ready", renew };
  return { url: secret ? `${window.location.origin}${PATH[kind](secret)}` : "", state, renew };
}

/** The link's field: the value to copy, or what stands in for it while it's made or when this browser lost it. */
function LinkField({ link, value, label, mono, preparing }: { link: LinkState; value: string; label: string; mono?: boolean; preparing: string }) {
  if (link.state === "busy") return <CopyRow value={preparing} label={label} mono={mono} disabled />;
  if (link.state === "lost")
    return <p className="small mcp-lost">This browser no longer has this link, though it still works wherever you put it. New link makes a fresh one here, and the old one stops working.</p>;
  if (link.state === "none" || !link.url) return <CopyRow value="Tap New link to make your link." label={label} disabled />;
  return <CopyRow value={value} label={label} mono={mono} />;
}

/* ── The sidebar rows ────────────────────────────────────────────────────────────────────────────────────────── */

type Which = "connect" | "share";

/** The two sidebar rows and the panels they open. Share your plan shows once the plan is written (`planned`). */
export function McpConnect({ planned }: { planned: boolean }) {
  const [open, setOpen] = useState<Which>();
  const [at, setAt] = useState<string>();
  useEffect(() => {
    const go = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setAt(d === "calendar" ? d : undefined);
      setOpen(d === "calendar" || d === "share" ? "share" : "connect");
    };
    window.addEventListener(MCP_EVENT, go);
    return () => window.removeEventListener(MCP_EVENT, go);
  }, []);
  const row = (which: Which, icon: string, name: string, title: string) => (
    <button type="button" className={`nav-item nav-${which === "connect" ? "mcp" : "share"}`} onClick={() => (setAt(undefined), setOpen(which))} title={title}>
      <span className="nav-glyph">
        <NavIcon name={icon} />
      </span>
      <span className="nav-label">
        <span className="nav-name">{name}</span>
      </span>
    </button>
  );
  return (
    <>
      {row("connect", "link", "Connect with Athena MCP", "Your brand and plan in Claude, Cursor or ChatGPT, over MCP")}
      {planned && row("share", "share", "Share your plan", "Your plan as a spreadsheet, in your calendar and as a page for your team")}
      {open && <McpPanel key={open} which={open} planned={planned} onClose={() => setOpen(undefined)} at={at} />}
    </>
  );
}

const HEAD: Record<Which, { title: string; founder: string; demo: string }> = {
  connect: {
    title: "Connect with Athena MCP",
    founder: "Your brand's live workspace as a remote MCP server, in Claude, Cursor, ChatGPT or any MCP client you already use.",
    demo: "A sample: the Fishwife tinned fish plan as a remote MCP server. Add it to any MCP client and ask what to do next. Once your own brand is set up, Connect with Athena MCP in the sidebar gives you your own.",
  },
  share: {
    title: "Share your plan",
    founder: "Your plan as a spreadsheet, in your calendar and as a page for your team. Files are copies as of the day you download them; the calendar feed and the team page follow the plan.",
    demo: "The Fishwife sample plan as a spreadsheet, in your calendar and as a page for a team. Once your own plan is written, Share your plan in the sidebar does the same for yours.",
  },
};

/** The panel. `demo`: the fixed read-only MCP link to the Fishwife sample (its path, from /api/workspace/demo), with
 *  both panels behind one switch. `planned`: the plan is written, so the connect panel says the AI reads it too. */
export function McpPanel({ onClose, demo, at, which = "connect", planned = true }: { onClose: () => void; demo?: string; at?: string; which?: Which; planned?: boolean }) {
  const [tab, setTab] = useState<Which>(which);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    if (at) requestAnimationFrame(() => document.getElementById(`mcp-${at}`)?.scrollIntoView({ block: "start" }));
  }, [at]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const head = HEAD[tab];
  // On the body, so a parent that makes its own stacking context (the start page's hero) can't draw over it.
  return createPortal(
    <div className="mcp-backdrop" role="dialog" aria-modal="true" aria-label={head.title} onClick={onClose}>
      <aside className="mcp-panel" onClick={(e) => e.stopPropagation()}>
        <header className="mcp-head">
          <div>
            <h2>{head.title}</h2>
            <p className="small muted">{demo ? head.demo : head.founder}</p>
            {tab === "connect" && (
              <div className="mcp-tag" aria-hidden>
                <span>remote MCP</span>
                <span>streamable HTTP</span>
                <span>{demo ? "read-only" : "no OAuth"}</span>
              </div>
            )}
          </div>
          <button type="button" ref={closeRef} className="mcp-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {demo && (
          <div className="seg mcp-seg mcp-switch" role="tablist" aria-label="Connect or share">
            {(["connect", "share"] as Which[]).map((w) => (
              <button key={w} type="button" role="tab" aria-selected={tab === w} className={tab === w ? "on" : ""} onClick={() => setTab(w)}>
                {HEAD[w].title}
              </button>
            ))}
          </div>
        )}

        {tab === "connect" ? <ConnectBody demo={demo} planned={planned} /> : <ShareBody demo={!!demo} />}
      </aside>
    </div>,
    document.body,
  );
}

/* ── Connect with Athena MCP ─────────────────────────────────────────────────────────────────────────────────── */

type Tool = "claude" | "claude-code" | "cursor" | "chatgpt";
const TOOLS: { id: Tool; name: string }[] = [
  { id: "claude", name: "Claude" },
  { id: "claude-code", name: "Claude Code" },
  { id: "cursor", name: "Cursor" },
  { id: "chatgpt", name: "ChatGPT" },
];

/** Three short steps for the chosen tool. `link` is substituted where the tool takes a command. */
function steps(tool: Tool, link: string, server: string): { steps: string[]; command?: string } {
  switch (tool) {
    case "claude":
      return { steps: ["In Claude, open Settings › Connectors.", 'Add a custom connector and choose "No sign-in".', "Paste the server URL below and save."] };
    case "claude-code":
      return { steps: ["Run this one command in your terminal:", "Then ask Claude Code about the brand."], command: `claude mcp add --transport http ${server} ${link || "<server-url>"}` };
    case "cursor":
      return { steps: ["In Cursor, open Settings › MCP › Add new server.", "Choose the HTTP type (no sign-in).", "Paste the server URL below and save."] };
    case "chatgpt":
      return { steps: ["Turn on developer mode (a paid plan), then open Settings › Connectors.", "Add a connector with no authentication.", "Paste the server URL below."] };
  }
}

/** The MCP link, with steps per tool, and the brand file for a tool that can't connect. */
function ConnectBody({ demo, planned }: { demo?: string; planned: boolean }) {
  const [tool, setTool] = useState<Tool>("claude");
  const [rotated, setRotated] = useState(false);
  const link = useLink("full", demo && `${window.location.origin}${demo}`);
  const [saved, setSaved] = useState(false);
  const { steps: how, command } = steps(tool, link.url, demo ? "athena-fishwife" : "athena");

  return (
    <>
      <section className="mcp-section" id="mcp-connect">
        <h3>Connect an MCP client</h3>
        <p className="small muted">
          {demo
            ? "Add the server URL to your MCP client and ask about Fishwife tinned fish: it reads Athena's real plan, crowds and outreach drafts as MCP resources."
            : planned
              ? "Add the server URL to your MCP client and ask it about your brand. It reads your brand, crowds, plan and drafts, and follows them as Athena works."
              : "Add the server URL to your MCP client and ask it about your brand. It reads your brand and what Athena knows so far; the plan joins when it's written."}
        </p>

        <div className="seg mcp-seg" role="tablist" aria-label="Choose your MCP client">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tool === t.id} className={tool === t.id ? "on" : ""} onClick={() => (setTool(t.id), setRotated(false))}>
              {t.name}
            </button>
          ))}
        </div>

        <ol className="mcp-steps">
          {how.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>

        <LinkField link={link} value={command ?? link.url} label={command ? "Copy command" : "Copy URL"} mono={!!command} preparing="Preparing your server URL…" />

        {demo ? (
          <p className="small muted mcp-note">Read-only: this server exposes resources and no write tools, so every client sees the same plan. Set up your own brand to get a server with write tools (mark tasks, add facts).</p>
        ) : (
          <>
            <div className="mcp-link-foot">
              <button type="button" className="mcp-new" onClick={async () => setRotated(await link.renew())} disabled={link.state === "busy"}>
                New link
              </button>
              <span className="small muted">{rotated ? "New link ready: the old one no longer works." : "Replaces the link in every tool using it."}</span>
            </div>
            <p className="small muted mcp-note">
              Anyone with this link can read your plan, mark tasks done, answer Athena&apos;s questions, add facts and ask Athena, which uses your budget. Keep it private like a password; New link stops the old one.
            </p>
          </>
        )}
      </section>

      <section className="mcp-section" id="mcp-file">
        <h3>As a file</h3>
        <p className="small muted">
          For an AI tool that can&apos;t connect: {demo ? "the Fishwife tinned fish sample" : "your brand"}, its crowds{planned ? ", Athena's plan in order and the open tasks," : " and what Athena knows so far,"} in one Markdown file any LLM can read. Drop it into a chat or a project. It&apos;s a copy as of the day you download it{demo ? "." : "; the link above stays current."}
        </p>
        <div className="mcp-link-foot">
          <SaveButton file={BRAND_FILE} save={() => saveBrandFile(!!demo)} onSaved={() => setSaved(true)} />
          {saved && <span className="small muted">Saved to your downloads.</span>}
        </div>
      </section>
    </>
  );
}

/* ── Share your plan ─────────────────────────────────────────────────────────────────────────────────────────── */

/** The plan as a spreadsheet, in a calendar, as a page for the team, and the Monday email. */
function ShareBody({ demo }: { demo: boolean }) {
  const [saved, setSaved] = useState(false);
  return (
    <>
      <section className="mcp-section" id="mcp-sheet">
        <h3>The plan as a spreadsheet</h3>
        <p className="small muted">
          {demo ? "The sample plan" : "Your plan"} for you and your team: a tab each for the outreach and every contact found, the drafts, the plan, the crowds and each subagent&apos;s tables.
        </p>
        <div className="mcp-link-foot">
          <SaveButton file={PLAN_FILE} save={() => savePlanSheet(demo)} onSaved={() => setSaved(true)} />
          {saved && <span className="small muted">Saved to your downloads.</span>}
        </div>
      </section>
      <Calendar demo={demo} />
      <section className="mcp-section" id="mcp-share">
        <h3>Share with your team</h3>
        <p className="small muted">
          {demo ? "The sample plan's" : "Your"} Execute Plan as a view-only page, for co-founders or advisors. It looks the same and follows the plan as it changes, with nothing to start or edit.
        </p>
        <ShareLink demo={demo} />
      </section>
      {demo ? <SendMeThis /> : <MondayEmail section />}
    </>
  );
}

/** Hands the browser a file to save. */
function hand(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const savedJourney = () => JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? "{}");

/** Downloads athena-brand.md (§23.6 f), built in the browser from its own journey; the demo's is the seeded sample's. */
export async function saveBrandFile(demo = false) {
  let text = "";
  try {
    if (demo) {
      const res = await fetch("/api/workspace/demo?file=1");
      if (res.headers.get("Content-Type")?.startsWith("text/markdown")) text = await res.text();
    } else {
      text = brandFile(savedJourney());
    }
  } catch {
    // Unreadable save or no network: the file below still says what Athena has (nothing yet).
  }
  hand(new Blob([text || brandFile({})], { type: "text/markdown;charset=utf-8" }), BRAND_FILE);
}

/** Downloads athena-plan.xlsx, the plan as a spreadsheet, built the same way. */
export async function savePlanSheet(demo = false) {
  let bytes: Uint8Array | undefined;
  try {
    if (demo) {
      const res = await fetch("/api/workspace/demo?file=plan");
      if (res.headers.get("Content-Type")?.startsWith(XLSX_TYPE)) bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      bytes = planWorkbook(savedJourney());
    }
  } catch {
    // Unreadable save or no network: the workbook below is a valid one that says what Athena has (nothing yet).
  }
  hand(new Blob([(bytes ?? planWorkbook({})) as BlobPart], { type: XLSX_TYPE }), PLAN_FILE);
}

/** A Download button for one of the files, held while it's built; `onSaved` once the browser has it. */
export function SaveButton({ file, save, onSaved }: { file: string; save: () => Promise<void>; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    await save();
    setBusy(false);
    onSaved?.();
  };
  return (
    <button type="button" className="mcp-new" onClick={click} disabled={busy}>
      Download {file}
    </button>
  );
}

/** §23.6 g: the plan's dated things in the founder's calendar. Subscribe (recommended) gives a live feed on its own
 *  calendar-only link, which New link replaces; Download saves a one-off .ics built in the browser. */
function Calendar({ demo }: { demo: boolean }) {
  const [how, setHow] = useState<"subscribe" | "download">("subscribe");
  const feed = useLink("cal", demo ? `${window.location.origin}${PATH.cal(DEMO_SECRET)}` : undefined, how === "subscribe");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const renew = async () => {
    if (await feed.renew()) setNote("New link ready: the old one stops updating. Subscribe again with this one.");
  };

  const save = async () => {
    setBusy(true);
    let text = "";
    try {
      if (demo) {
        const res = await fetch(`/cal/${DEMO_SECRET}.ics?download=1`);
        if (res.headers.get("Content-Type")?.startsWith("text/calendar")) text = await res.text();
      } else {
        text = calendarFile(savedJourney(), { base: window.location.origin });
      }
    } catch {
      // Unreadable save or no network: the file below is a valid, empty calendar.
    }
    hand(new Blob([text || calendarFile({})], { type: "text/calendar;charset=utf-8" }), CAL_FILE);
    setBusy(false);
    setNote("Saved to your downloads. Open it to add the dates to your calendar.");
  };

  const pick = (h: typeof how) => {
    setHow(h);
    setNote("");
  };
  return (
    <section className="mcp-section" id="mcp-calendar">
      <h3>Calendar</h3>
      <p className="small muted">
        {demo ? "The sample plan's" : "Your plan's"} dated steps: events and their apply-by deadlines, moments, follow-ups as they fall due, and the launch once it has an exact date. Each one links to its source.
      </p>
      <div className="seg mcp-seg" role="tablist" aria-label="Subscribe or download">
        <button type="button" role="tab" aria-selected={how === "subscribe"} className={how === "subscribe" ? "on" : ""} onClick={() => pick("subscribe")}>
          Subscribe (recommended)
        </button>
        <button type="button" role="tab" aria-selected={how === "download"} className={how === "download" ? "on" : ""} onClick={() => pick("download")}>
          Download
        </button>
      </div>
      {how === "subscribe" ? (
        <>
          <ol className="mcp-steps">
            <li>Google Calendar: Other calendars › + › From URL, then paste the link.</li>
            <li>Apple Calendar or Outlook: add a calendar subscription, then paste the link.</li>
          </ol>
          <LinkField link={feed} value={feed.url} label="Copy link" preparing="Preparing your calendar link…" />
          <div className="mcp-link-foot">
            {feed.state === "ready" && feed.url && (
              <a className="mcp-new" href={feed.url.replace(/^https?:/, "webcal:")}>
                Open in your calendar app
              </a>
            )}
            {!demo && (
              <button type="button" className="mcp-new" onClick={renew} disabled={feed.state === "busy"}>
                New link
              </button>
            )}
            {note && <span className="small muted">{note}</span>}
          </div>
          <p className="small muted mcp-note">It stays in step with the plan: calendar apps check it every few hours. The link only gives the dates, never the rest of your workspace.</p>
        </>
      ) : (
        <>
          <p className="small muted">A copy of the dates as they stand today. It won&apos;t change when the plan does.</p>
          <div className="mcp-link-foot">
            <button type="button" className="mcp-new" onClick={save} disabled={busy}>
              Download {CAL_FILE}
            </button>
            {note && <span className="small muted">{note}</span>}
          </div>
        </>
      )}
    </section>
  );
}

/** The team page's link (§23.6 k), made the first time it's shown, with Copy link, Open the page and New link (which
 *  revokes the old one). The demo shows the Fishwife sample's page, with no New link. Also on the dashboard: a new
 *  link reaches every copy on the page, so none shows a revoked one. */
export function ShareLink({ demo = false }: { demo?: boolean }) {
  const link = useLink("share", demo ? `${window.location.origin}${PATH.share(DEMO_SECRET)}` : undefined);
  const [note, setNote] = useState("");
  const renew = async () => {
    if (await link.renew()) setNote("New link ready: the old one no longer opens the plan.");
  };
  return (
    <>
      <LinkField link={link} value={link.url} label="Copy link" preparing="Preparing your share link…" />
      <div className="mcp-link-foot">
        {link.state === "ready" && link.url && (
          <a className="mcp-new" href={link.url} target="_blank" rel="noopener noreferrer">
            Open the page
          </a>
        )}
        {!demo && (
          <button type="button" className="mcp-new" onClick={renew} disabled={link.state === "busy"}>
            New link
          </button>
        )}
        {note && <span className="small muted">{note}</span>}
      </div>
      {!demo && <p className="small muted mcp-note">View only: anyone with the link can see the plan, and nothing else in your workspace. Use New link to stop the old one working.</p>}
    </>
  );
}

/** "Email me this every Monday" (§23.6 j): the founder's address and one toggle, saved for the Monday run. Hidden
 *  until Athena's sending account is set up, so it never offers a send that can't happen. Under This week on the
 *  dashboard, and as its own section (`section`) in Share your plan. */
export function MondayEmail({ section }: { section?: boolean }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [on, setOn] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/digest?ws=${encodeURIComponent(workspace())}`)
      .then((r) => r.json())
      .then((j: { ready?: boolean; email?: string; on?: boolean }) => {
        if (!live) return;
        setReady(!!j.ready);
        if (j.email) setEmail(j.email);
        setOn(!!j.on);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!ready) return null;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const save = async (next: boolean) => {
    if (!valid) return setNote("Add your email address first.");
    setOn(next);
    const r = await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws: workspace(), email: email.trim(), on: next }) })
      .then((x) => x.json() as Promise<{ ok?: boolean }>)
      .catch(() => ({ ok: false }));
    if (!r.ok) setOn(!next);
    setNote(r.ok ? (next ? `Every Monday morning, to ${email.trim()}.` : "Off. Turn it on again any time.") : "Saving takes a moment; try the toggle again.");
  };
  const body = (
    <div className="week-mail">
      <label className="week-mail-toggle">
        <input type="checkbox" checked={on} onChange={(e) => save(e.target.checked)} />
        <span>Email me this every Monday</span>
      </label>
      <input type="email" className="week-mail-to" placeholder="you@yourbrand.com" value={email} onChange={(e) => (setEmail(e.target.value), setNote(""))} onBlur={() => on && valid && save(true)} aria-label="Your email address" />
      {note && <small className="muted">{note}</small>}
    </div>
  );
  return section ? (
    <MailSection>
      <p className="small muted">This week by email each Monday morning: pitches with no reply, what&apos;s due, and the next events.</p>
      {body}
    </MailSection>
  ) : (
    body
  );
}

function MailSection({ children }: { children: ReactNode }) {
  return (
    <section className="mcp-section" id="mcp-email">
      <h3>Monday email</h3>
      {children}
    </section>
  );
}

/** The judges' Send me this (§23.6 j): the Fishwife sample's This week, emailed once to the address they type, as a
 *  founder gets it every Monday. Hidden until Athena's sending account is set up. */
function SendMeThis() {
  const [ready, setReady] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/digest")
      .then((r) => r.json())
      .then((j: { ready?: boolean }) => live && setReady(!!j.ready))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!ready) return null;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const send = async () => {
    setBusy(true);
    const j = await fetch("/api/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true, email: to.trim() }) })
      .then((r) => r.json() as Promise<{ result?: string }>)
      .catch(() => ({ result: "busy" }));
    setBusy(false);
    setNote(
      j.result === "sent"
        ? `On its way to ${to.trim()}. It can take a minute; check spam if it doesn't show.`
        : j.result === "already"
          ? "Already sent to this address today: check your inbox."
          : j.result === "bad"
            ? "That address doesn't look complete."
            : "Athena has sent a lot of samples today. Try again tomorrow.",
    );
  };
  return (
    <MailSection>
      <p className="small muted">Each Monday a founder gets This week by email: pitches with no reply, what&apos;s due, and the next events. Get the sample&apos;s once.</p>
      <div className="mcp-link-foot">
        <input type="email" className="week-mail-to" placeholder="you@example.com" value={to} onChange={(e) => (setTo(e.target.value), setNote(""))} aria-label="Your email address" />
        <button type="button" className="mcp-new" onClick={send} disabled={busy || !valid}>
          {busy ? "Sending…" : "Send me this"}
        </button>
      </div>
      {note && <small className="muted">{note}</small>}
    </MailSection>
  );
}

/** A read-only field with a Copy button, as the drafts use (components/Executive.tsx). Copies the value, not an id.
 *  `disabled`: the field is only a status line (preparing, or nothing yet), so there's nothing to copy. */
function CopyRow({ value, label, mono, disabled }: { value: string; label: string; mono?: boolean; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (disabled || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      // Clipboard unavailable: the founder can still select the text.
    }
  };
  return (
    <div className="mcp-copy">
      <input className={mono ? "mcp-field mono" : "mcp-field"} value={value} readOnly onFocus={(e) => !disabled && e.currentTarget.select()} aria-label={label} />
      <button type="button" onClick={copy} disabled={disabled || !value}>
        {done ? "Copied" : label}
      </button>
    </div>
  );
}
