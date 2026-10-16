"use client";

import { useEffect, useRef } from "react";

// The edge between a workspace's chat and its right panel, as a handle the founder can drag (or nudge with the arrow
// keys) to give either side more room. The width lands in a CSS variable on the workspace, so the layout itself stays
// in the stylesheet; the chat always keeps room to read and the panel never gets too narrow for its cards. Double-click
// puts it back. The width is remembered in this browser only. Client-only.

const MIN_PANEL = 340;
const MIN_CHAT = 420;

export function PanelGrip({ prop, chat, panel, extra = 0, store }: {
  /** The CSS variable on the workspace that holds the panel's width. */
  prop: string;
  /** Selectors, inside the workspace, for the chat and the panel. */
  chat: string;
  panel: string;
  /** Room the panel's column takes beyond the panel itself (its margin). */
  extra?: number;
  store: string;
}) {
  const grip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = grip.current?.parentElement;
    if (!host) return;
    // The chosen width, fitted to the window: it gives way when the window narrows and comes back when it widens.
    const fit = () => {
      let saved = 0;
      try {
        saved = Number(localStorage.getItem(store));
      } catch {}
      if (saved > 0) {
        host.style.setProperty(prop, `${saved}px`);
        set(host, saved, false);
      }
    };
    requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const els = (host: HTMLElement) => ({ c: host.querySelector<HTMLElement>(chat), p: host.querySelector<HTMLElement>(panel) });
  const current = (host: HTMLElement) => {
    const { p } = els(host);
    return p ? p.getBoundingClientRect().width + extra : null;
  };
  /** How wide the chat is left, from its left edge to the panel's. */
  const room0 = (host: HTMLElement) => {
    const { c, p } = els(host);
    return c && p ? p.getBoundingClientRect().left - c.getBoundingClientRect().left : null;
  };
  const set = (host: HTMLElement, w: number, save = true) => {
    const now = current(host) ?? w;
    const room = room0(host) ?? Infinity;
    const max = now + (room - MIN_CHAT);
    const v = Math.round(Math.max(MIN_PANEL, Math.min(w, Math.max(MIN_PANEL, max))));
    host.style.setProperty(prop, `${v}px`);
    grip.current?.setAttribute("aria-valuenow", String(v));
    if (save) {
      try {
        localStorage.setItem(store, String(v));
      } catch {}
    }
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = grip.current?.parentElement;
    const w0 = host && current(host);
    if (!host || w0 == null || e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    host.classList.add("resizing");
    // Each move measures against where the drag began, so the panel follows the pointer exactly.
    const base = { w: w0, room: room0(host) ?? Infinity };
    let last = w0;
    const move = (ev: PointerEvent) => {
      const want = base.w + (x0 - ev.clientX);
      const max = base.w + (base.room - MIN_CHAT);
      last = Math.round(Math.max(MIN_PANEL, Math.min(want, Math.max(MIN_PANEL, max))));
      host.style.setProperty(prop, `${last}px`);
    };
    const up = () => {
      host.classList.remove("resizing");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.setAttribute("aria-valuenow", String(last));
      try {
        localStorage.setItem(store, String(last));
      } catch {}
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const reset = () => {
    const host = grip.current?.parentElement;
    if (!host) return;
    host.style.removeProperty(prop);
    try {
      localStorage.removeItem(store);
    } catch {}
  };

  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const host = grip.current?.parentElement;
    const w = host && current(host);
    if (!host || w == null) return;
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") set(host, w + step);
    else if (e.key === "ArrowRight") set(host, w - step);
    else if (e.key === "Home" || e.key === "Enter") reset();
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={grip}
      className="panel-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize the chat and the panel"
      aria-valuemin={MIN_PANEL}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={down}
      onDoubleClick={reset}
      onKeyDown={key}
    >
      <span aria-hidden />
    </div>
  );
}
