"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { workspace } from "@/lib/knowledge/workspace";
import { NavIcon } from "./SideNav";
import { BRAND_FILE, brandFile } from "@/lib/workspace/brand-file";
import { CAL_FILE, calendarFile } from "@/lib/workspace/calendar";

// "Athena MCP" (PRD §23.6 d): a quiet sidebar row opens one frosted side panel (a full-screen sheet on a phone).
// Section 1, "Your AI assistant", gives the founder a link to paste into Claude, Claude Code, Cursor or ChatGPT,
// with three short steps for the chosen tool, and New link to rotate it. The link is the founder's own connect link
// (§23.6 c): the server keeps only its hash, so the browser remembers the secret it was shown and only New link
// changes it. The same panel opens from /plan's first screen on the judges' demo (§23.6 e): the fixed, read-only
// link to the precomputed Fishwife plan, with no New link (rotating a shared link would break it for everyone).
// Section 2, "As a file" (f), downloads athena-brand.md, built in the browser from its own journey (the demo's comes
// from the seeded sample). Section 3, "Calendar" (g): Subscribe to a live feed of the plan's dated things, on its own
// calendar-only link, or Download a one-off .ics. "In your calendar" lines elsewhere open the panel at this section
// (the `athena:mcp` window event). Section 4 (Share with your team) arrives with (k).

const SECRET_KEY = "athena:link:full"; // the secret this browser was shown, so the panel shows the same link each time
const CAL_KEY = "athena:link:cal"; // the calendar feed's own secret, kept the same way
const JOURNEY_KEY = "athena:journey:v1"; // the journey as components/Journey.tsx saves it: { brief, journey, … }
/** The demo's calendar feed: the demo link's fixed secret, read only (lib/workspace/demo.ts). */
const DEMO_CAL = "fishwife-sample-plan";

/** Opens the panel from anywhere, at a section: `window.dispatchEvent(new CustomEvent(MCP_EVENT, { detail: "calendar" }))`. */
export const MCP_EVENT = "athena:mcp";

/** A one-line "In your calendar" link, for a dated item on the Promoter's calendar or an Execute Plan row (§23.6 g). */
export function InYourCalendar() {
  return (
    <button type="button" className="linkish small in-cal" onClick={() => window.dispatchEvent(new CustomEvent(MCP_EVENT, { detail: "calendar" }))}>
      In your calendar
    </button>
  );
}

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
      return { steps: ["In Claude, open Settings › Connectors.", 'Add a custom connector and choose "No sign-in".', "Paste the link below and save."] };
    case "claude-code":
      return { steps: ["Run this one command in your terminal:", "Then ask Claude Code about the brand."], command: `claude mcp add --transport http ${server} ${link || "<link>"}` };
    case "cursor":
      return { steps: ["In Cursor, open Settings › MCP › Add new server.", "Choose the HTTP type (no sign-in).", "Paste the link below and save."] };
    case "chatgpt":
      return { steps: ["Turn on developer mode (a paid plan), then open Settings › Connectors.", "Add a connector with no authentication.", "Paste the link below."] };
  }
}

/** The quiet sidebar row and the panel it opens. Self-contained: it mints and rotates its own link. */
export function McpConnect() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<string>();
  useEffect(() => {
    const go = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setAt(typeof d === "string" ? d : undefined);
      setOpen(true);
    };
    window.addEventListener(MCP_EVENT, go);
    return () => window.removeEventListener(MCP_EVENT, go);
  }, []);
  return (
    <>
      <button type="button" className="nav-item nav-mcp" onClick={() => (setAt(undefined), setOpen(true))} title="Plug your plan into Claude, Cursor or ChatGPT over MCP">
        <span className="nav-glyph">
          <NavIcon name="link" />
        </span>
        <span className="nav-label">
          <span className="nav-name">Athena MCP</span>
        </span>
      </button>
      {open && <McpPanel onClose={() => setOpen(false)} at={at} />}
    </>
  );
}

/** The panel. `demo`: the fixed read-only link to the Fishwife sample (its path, from /api/workspace/demo). */
export function McpPanel({ onClose, demo, at }: { onClose: () => void; demo?: string; at?: string }) {
  const [tool, setTool] = useState<Tool>("claude");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotated, setRotated] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The full URL from a stored secret, or undefined if there's none yet.
  const urlFrom = useCallback((secret: string | null) => (secret && typeof window !== "undefined" ? `${window.location.origin}/mcp/${secret}` : ""), []);

  const mint = useCallback(async (): Promise<string> => {
    const ws = workspace();
    try {
      const res = await fetch("/api/workspace/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws, scope: "full" }) });
      const j = (await res.json()) as { ok?: boolean; path?: string };
      const secret = j.ok && j.path ? j.path.replace(/^\/mcp\//, "") : "";
      if (secret) {
        try {
          localStorage.setItem(SECRET_KEY, secret);
        } catch {
          // Storage unavailable: the link still works this visit.
        }
      }
      return secret;
    } catch {
      return "";
    }
  }, []);

  // On open: the demo's fixed link; else the link this browser already has, or one minted the first time.
  useEffect(() => {
    let live = true;
    (async () => {
      if (demo) {
        setLink(`${window.location.origin}${demo}`);
        return;
      }
      let secret = "";
      try {
        secret = localStorage.getItem(SECRET_KEY) ?? "";
      } catch {
        // Storage unavailable.
      }
      if (!secret) {
        setBusy(true);
        secret = await mint();
        if (live) setBusy(false);
      }
      if (live) setLink(urlFrom(secret));
    })();
    closeRef.current?.focus();
    if (at) requestAnimationFrame(() => document.getElementById(`mcp-${at}`)?.scrollIntoView({ block: "start" }));
    return () => {
      live = false;
    };
  }, [demo, mint, urlFrom, at]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const newLink = useCallback(async () => {
    setBusy(true);
    setRotated(false);
    const secret = await mint();
    setLink(urlFrom(secret));
    setBusy(false);
    setRotated(true);
  }, [mint, urlFrom]);

  const { steps: how, command } = steps(tool, link, demo ? "athena-fishwife" : "athena");

  // On the body, so a parent that makes its own stacking context (the start page's hero) can't draw over it.
  return createPortal(
    <div className="mcp-backdrop" role="dialog" aria-modal="true" aria-label="Athena MCP" onClick={onClose}>
      <aside className="mcp-panel" onClick={(e) => e.stopPropagation()}>
        <header className="mcp-head">
          <div>
            <h2>Athena MCP</h2>
            <p className="small muted">{demo ? "The Fishwife sample plan as a live MCP server. Plug it into your AI and ask what to do next." : "Your brand's live workspace as an MCP server: plan, crowds and drafts, inside the AI tools you already use."}</p>
            <div className="mcp-tag" aria-hidden>
              <span>remote MCP</span>
              <span>streamable HTTP</span>
              <span>{demo ? "read-only" : "no OAuth"}</span>
            </div>
          </div>
          <button type="button" ref={closeRef} className="mcp-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <section className="mcp-section">
          <h3>Your AI assistant</h3>
          <p className="small muted">
            {demo
              ? "Connect it to your assistant and ask about Fishwife: it reads Athena's real plan, crowds and outreach drafts for the brand."
              : "Connect Athena to your assistant and ask it about your brand. It reads your real plan, crowds and drafts, and can mark tasks done as you go."}
          </p>

          <div className="seg mcp-seg" role="tablist" aria-label="Choose your tool">
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

          {busy ? (
            <CopyRow value="Preparing your link…" label={command ? "Copy command" : "Copy link"} mono={!!command} disabled />
          ) : !link ? (
            <CopyRow value="Couldn't prepare a link — tap New link to try again." label="Copy link" disabled />
          ) : command ? (
            <CopyRow value={command} label="Copy command" mono />
          ) : (
            <CopyRow value={link} label="Copy link" />
          )}

          {demo ? (
            <p className="small muted mcp-note">Read-only: your AI can read the sample plan but can't change it, so everyone who connects sees the same one. Start your own brand to get a link that can mark tasks and add facts.</p>
          ) : (
            <>
              <div className="mcp-link-foot">
                <button type="button" className="mcp-new" onClick={newLink} disabled={busy}>
                  New link
                </button>
                <span className="small muted">{rotated ? "New link ready — the old one no longer works." : "Replaces the current link everywhere it's used."}</span>
              </div>
              <p className="small muted mcp-note">The link is the key, so there's no sign-in. Anyone with it can read your plan: keep it to yourself and use New link if it leaks.</p>
            </>
          )}
        </section>

        <AsAFile demo={!!demo} />
        <Calendar demo={!!demo} />
      </aside>
    </div>,
    document.body,
  );
}

/** Section 2 (§23.6 f): one line on what's in the file, and one button that downloads it. */
function AsAFile({ demo }: { demo: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const save = async () => {
    setBusy(true);
    let text = "";
    try {
      if (demo) {
        const res = await fetch("/api/workspace/demo?file=1");
        if (res.headers.get("Content-Type")?.startsWith("text/markdown")) text = await res.text();
      } else {
        text = brandFile(JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? "{}"));
      }
    } catch {
      // Unreadable save or no network: the file below still says what Athena has (nothing yet).
    }
    if (!text) text = brandFile({});
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: BRAND_FILE });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBusy(false);
    setDone(true);
  };
  return (
    <section className="mcp-section">
      <h3>As a file</h3>
      <p className="small muted">
        {demo ? "The Fishwife sample" : "Your brand"}, its crowds, Athena&apos;s plan in order and the open tasks, in one file any AI assistant can read. Drop it into a chat or a project.
      </p>
      <div className="mcp-link-foot">
        <button type="button" className="mcp-new" onClick={save} disabled={busy}>
          Download {BRAND_FILE}
        </button>
        {done && <span className="small muted">Saved to your downloads.</span>}
      </div>
    </section>
  );
}

/** Section 3 (§23.6 g): the plan's dated things in the founder's calendar. Subscribe (recommended) gives a live feed
 *  on its own calendar-only link, which New link replaces; Download saves a one-off .ics built in the browser. */
function Calendar({ demo }: { demo: boolean }) {
  const [how, setHow] = useState<"subscribe" | "download">("subscribe");
  const [feed, setFeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const mint = useCallback(async (): Promise<string> => {
    try {
      const res = await fetch("/api/workspace/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ws: workspace(), scope: "cal" }) });
      const j = (await res.json()) as { ok?: boolean; path?: string };
      const secret = j.ok && j.path ? j.path.replace(/^\/cal\//, "").replace(/\.ics$/, "") : "";
      if (secret)
        try {
          localStorage.setItem(CAL_KEY, secret);
        } catch {
          // Storage unavailable: the link still works this visit.
        }
      return secret;
    } catch {
      return "";
    }
  }, []);
  const urlOf = (secret: string) => (secret ? `${window.location.origin}/cal/${secret}.ics` : "");

  // The feed link: the demo's fixed one, else this browser's, minted the first time Subscribe is shown.
  useEffect(() => {
    if (how !== "subscribe" || feed) return;
    if (demo) return void setFeed(urlOf(DEMO_CAL));
    let live = true;
    (async () => {
      let secret = "";
      try {
        secret = localStorage.getItem(CAL_KEY) ?? "";
      } catch {
        // Storage unavailable.
      }
      if (!secret) {
        setBusy(true);
        secret = await mint();
        if (live) setBusy(false);
      }
      if (live) setFeed(urlOf(secret));
    })();
    return () => {
      live = false;
    };
  }, [how, feed, demo, mint]);

  const renew = async () => {
    setBusy(true);
    setFeed(urlOf(await mint()));
    setBusy(false);
    setNote("New link ready: the old one stops updating. Subscribe again with this one.");
  };

  const save = async () => {
    setBusy(true);
    let text = "";
    try {
      if (demo) {
        const res = await fetch(`/cal/${DEMO_CAL}.ics?download=1`);
        if (res.headers.get("Content-Type")?.startsWith("text/calendar")) text = await res.text();
      } else {
        text = calendarFile(JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? "{}"), { base: window.location.origin });
      }
    } catch {
      // Unreadable save or no network: the file below is a valid, empty calendar.
    }
    if (!text) text = calendarFile({});
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: CAL_FILE }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          {busy ? <CopyRow value="Preparing your calendar link…" label="Copy link" disabled /> : <CopyRow value={feed} label="Copy link" />}
          <div className="mcp-link-foot">
            {feed && !busy && (
              <a className="mcp-new" href={feed.replace(/^https?:/, "webcal:")}>
                Open in your calendar app
              </a>
            )}
            {!demo && (
              <button type="button" className="mcp-new" onClick={renew} disabled={busy}>
                New link
              </button>
            )}
            {note && <span className="small muted">{note}</span>}
          </div>
          <p className="small muted mcp-note">It stays in step with the plan: calendar apps check it every few hours. The link only opens the calendar, never the rest of your workspace.</p>
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
