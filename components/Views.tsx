"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelGrip } from "./Resize";
import { nameOf, type AgentId, type SpecialistId } from "@/lib/agent/specialists";

// The three views after onboarding (PRD §23.2 step 8.5a): the dashboard, the Athena tab and a subagent's page. Each
// is only a layout: the journey holds every piece of state and hands in the sidebar, the one chat and the outputs.

/** Which view is open: `/plan` is the dashboard, `/plan?agent=athena` the Athena tab, `/plan?agent=scout` a subagent page. */
export type Page = AgentId | "dashboard";

/**
 * The full-screen dashboard (§23.2 step 8.5j): the sidebar and the page, with the one chat with Athena in a drawer
 * from the side (full screen on a phone). While a step waits on the founder, the drawer's button says who for.
 */
export function DashboardPage({ nav, chat, paused, open, setOpen, children }: { nav: ReactNode; chat: ReactNode; paused?: string; open: boolean; setOpen: (o: boolean) => void; children: ReactNode }) {
  const drawer = useRef<HTMLDivElement>(null);
  // The chat mounts as the drawer opens, so it opens on the latest line rather than the top of the history.
  useEffect(() => {
    const list = open ? drawer.current?.querySelector(".msgs") : null;
    if (list) list.scrollTop = list.scrollHeight;
  }, [open]);
  return (
    <main className={`journey-main agent-stage page-stage dash-stage${open ? " drawer-on sheet-on" : ""}`}>
      {nav}
      <section className="dash-page" aria-label="Your dashboard">
        <header className="page-head">
          <strong>Your dashboard</strong>
          <button type="button" className={`chat-open${paused ? " chat-open-paused" : ""}`} onClick={() => setOpen(true)} aria-expanded={open}>
            Chat with Athena
            {paused && <span className="chat-badge">Paused for you · {paused}</span>}
          </button>
        </header>
        <div className="dash-page-body">{children}</div>
      </section>
      <div className="chat-drawer" ref={drawer} aria-hidden={!open} inert={!open}>
        <button type="button" className="linkish small chat-drawer-close" onClick={() => setOpen(false)}>
          Close ›
        </button>
        {open && chat}
      </div>
      {open && <button type="button" className="chat-scrim" aria-label="Close the chat" onClick={() => setOpen(false)} />}
    </main>
  );
}

/**
 * The Athena tab: her chat, with the subagents' work in the panel on the right, one tab each. The panel opens beside
 * the chat on a desktop and collapses to a slim rail that opens it again (founder, 21 Oct); on a phone it is a
 * full-screen sheet.
 */
export function AthenaRoom(p: {
  nav: ReactNode;
  chat: ReactNode;
  tabs: AgentId[];
  tab: AgentId;
  onTab: (id: AgentId) => void;
  /** Live state per tab, so a working subagent shows it from its tab. */
  state: (id: AgentId) => "working" | "waiting" | undefined;
  /** False once the founder picked a tab: "Follow the run" brings back the following (§23.2 step 8.5i). */
  follow: boolean;
  onFollow: () => void;
  open: boolean;
  sheet: boolean;
  onHide: () => void;
  onShow: () => void;
  onBack: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const label = p.tab === "athena" ? "Athena's work" : `the ${nameOf(p.tab)}'s work`;
  return (
    <main className={`journey-main journey-team agent-stage${p.open ? " with-panel" : ""}${p.sheet ? " sheet-on" : ""}`}>
      {p.nav}
      {p.chat}
      {p.open && <PanelGrip prop="--panel-user" chat=".chat" panel=".agent-panel" store="athena.panel-w" />}
      <aside className={`agent-panel${p.open ? "" : " agent-panel-shut"}`} aria-label={label}>
        {!p.open && (
          <button type="button" className="panel-rail" onClick={p.onShow} aria-label={`Show ${label}`} title={`Show ${label}`}>
            <span className="panel-chev panel-chev-open" aria-hidden />
            <span className="panel-rail-label">{p.tab === "athena" ? "Athena's work" : `The ${nameOf(p.tab)}`}</span>
            <span className="panel-rail-dots" aria-hidden>
              {p.tabs.map((id) => {
                const s = p.state(id);
                return s ? <span key={id} className={`panel-rail-dot panel-rail-${s}`} title={`The ${nameOf(id)}`} /> : null;
              })}
            </span>
          </button>
        )}
        <div className="agent-panel-bar">
          <button type="button" className="linkish small agent-panel-back" onClick={p.onBack}>← Back to the chat</button>
          <div className="panel-tabs" role="tablist" aria-label="Athena and the subagents">
            {p.tabs.map((id) => {
              const s = p.state(id);
              return (
                <button key={id} type="button" role="tab" aria-selected={p.tab === id} className={`panel-tab${p.tab === id ? " on" : ""}${s ? ` panel-tab-${s}` : ""}`} onClick={() => p.onTab(id)}>
                  {s === "working" && <span className="spin" aria-hidden />}
                  {s === "waiting" && <span className="nav-wait" aria-hidden />}
                  {nameOf(id)}
                </button>
              );
            })}
          </div>
          {!p.follow && (
            <button type="button" className="follow-chip" onClick={p.onFollow}>
              <span className="nav-wait" aria-hidden /> Follow the run
            </button>
          )}
          <button type="button" className="agent-panel-hide" onClick={p.onHide} aria-label="Collapse the panel" title="Collapse">
            <span className="panel-chev" aria-hidden />
          </button>
        </div>
        <div className="agent-panel-body" ref={p.panelRef} key={p.tab}>
          {p.children}
        </div>
      </aside>
    </main>
  );
}

/** A subagent's page: its work in the main area, with the same chat with Athena docked beside it. */
export function SubagentPage({ id, nav, chat, bodyRef, children }: { id: SpecialistId; nav: ReactNode; chat: ReactNode; bodyRef: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  // On a phone the chat is a sheet over the page, opened from the page's head.
  const [sheet, setSheet] = useState(false);
  return (
    <main className={`journey-main agent-stage page-stage sub-stage${sheet ? " sheet-on" : ""}`}>
      {nav}
      <section className="sub-page" aria-label={`The ${nameOf(id)}'s work`}>
        <header className="page-head sub-page-head">
          <span className="page-kicker">Subagent</span>
          <button type="button" className="chat-open sub-chat-open" onClick={() => setSheet(true)}>
            Chat with Athena
          </button>
        </header>
        <div className="sub-page-body" key={id} ref={bodyRef}>
          {children}
        </div>
      </section>
      <div className="chat-dock">
        <button type="button" className="linkish small chat-dock-back" onClick={() => setSheet(false)}>← Back to the {nameOf(id)}</button>
        {chat}
      </div>
    </main>
  );
}
