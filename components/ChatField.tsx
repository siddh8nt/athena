"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The product's backdrop: a very faint, even scatter of small mono characters, each fading in at its own random moment,
// holding briefly and fading out, while the whole field rises slowly. It answers the pointer: hovering wakes and lights
// the characters around it, and a click sends an ochre ring rippling out through them. While an agent works the field
// quickens a little (shorter rests, a few ochre glints) and settles back when the work ends. Visual only: it reads nothing but
// the page's own "working" marks, and it mounts itself into whichever chat surface is on screen. On the landing page it
// covers the window, fixed behind the scrolling content; the titles keep their own clearings. One canvas, one
// requestAnimationFrame loop held to ~24 frames a second, paused while the tab is hidden; a still frame under
// prefers-reduced-motion.

const HOST = ".ob-first, .ob-work, .journey-main.agent-stage, .landing-page";
const LANDING = ".landing-page";
const WORKING = ".ob-live, .ob-think, .ob-agent-live, .streaming, .typing, .step-running, .live-steps .step-active, .team-working";
// A machine's vocabulary, never more than two characters: hex bytes, bit pairs and short pieces of code syntax, so from a
// distance the field reads as code. Repeating a set raises how often it shows.
const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).toUpperCase().padStart(2, "0"));
const BITS = ["00", "01", "10", "11"];
const SYNTAX = ["{}", "[]", "()", "=>", "!=", "==", "&&", "||", "//", "/*", "*/", "<>", "::", "->", "++", "+=", "0x", "\\n", "fn", "if", "?:", ";", "#", "$", "%", "@", "&", "|", "~", "^"];
const TOKENS = [...HEX, ...Array(16).fill(BITS).flat(), ...Array(3).fill(SYNTAX).flat()];
const CW = 22, CH = 16;

const pick = () => TOKENS[(Math.random() * TOKENS.length) | 0];

export function ChatField() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  // Follow the page: which chat surface is showing, and whether anyone on it is working.
  useEffect(() => {
    let queued = 0;
    const look = () => {
      queued = 0;
      setHost(document.querySelector<HTMLElement>(HOST));
      setBusy(!!document.querySelector(WORKING));
    };
    const mo = new MutationObserver(() => { if (!queued) queued = window.setTimeout(look, 120); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    look();
    return () => { mo.disconnect(); clearTimeout(queued); };
  }, []);

  if (!host) return null;
  return createPortal(<Field host={host} busy={busy} />, host);
}

function Field({ host, busy }: { host: HTMLElement; busy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(busy);
  live.current = busy;

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The landing page scrolls under a window-sized field; the product screens carry the field on their own surface.
    const fixed = host.matches(LANDING);
    if (fixed) cv.classList.add("chat-field-fixed");

    let w = 0, h = 0, cols = 0, rows = 0;
    // Each cell lives its own cycle: dark for a random rest, then its character fades in, holds a moment and fades out,
    // and the next cycle draws a new character and a new rest. So at any moment a thin, even scatter is showing, and which
    // characters make it up keeps changing; nothing settles into fixed shapes or fixed holes.
    let chars: string[] = [], age = new Float32Array(0), life = new Float32Array(0);
    let glow = new Float32Array(0), seed = new Float32Array(0);
    let wake = live.current ? 1 : 0;
    let raf = 0, last = 0;
    // The whole field rises very slowly; rows that leave the top come back in at the bottom, fresh.
    let oy = 0, base = 0;
    // The pointer, in field coordinates, with an eased presence; and the rings that clicks send out.
    const ptr = { x: 0, y: 0, on: false, s: 0 };
    let rings: { x: number; y: number; age: number }[] = [];
    const HOVER = 120, RING = 520, RING_LIFE = 1.1, RISE = 5;
    const LIFE = [1.6, 3.2], REST = [5, 16];
    const between = ([a, b]: number[]) => a + Math.random() * (b - a);

    // A fresh cycle for one cell (age below zero is its rest). `anywhere` starts it at a random point of a cycle, so the
    // field opens already in its steady state instead of all fading in together.
    const born = (i: number, anywhere = false) => {
      chars[i] = pick();
      life[i] = between(LIFE);
      seed[i] = Math.random();
      const rest = between(REST);
      age[i] = anywhere ? -rest + Math.random() * (rest + life[i]) : -rest;
    };

    const size = () => {
      // Layout size, not the on-screen rect: the workspace may be mid-animation (scaled) when this runs.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = fixed ? window.innerWidth : host.clientWidth; h = fixed ? window.innerHeight : host.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `500 11px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
      ctx.textBaseline = "top"; ctx.textAlign = "center";
      cols = Math.ceil(w / CW); rows = Math.ceil(h / CH) + 1;
      const n = cols * rows;
      chars = new Array(n); age = new Float32Array(n); life = new Float32Array(n);
      glow = new Float32Array(n); seed = new Float32Array(n);
      for (let i = 0; i < n; i++) born(i, true);
      oy = 0; base = 0;
      if (calm) draw();
    };

    // The conversation sits on clear glass, so the field runs at one strength everywhere and shows through it (founder, 17 Oct).
    // The pointer's pull at a point: 0 far away, up to 1 under it.
    const near = (x: number, y: number) => {
      if (ptr.s < 0.01) return 0;
      const dx = x - ptr.x, dy = y - ptr.y;
      return ptr.s * Math.exp(-(dx * dx + dy * dy) / (2 * HOVER * HOVER));
    };
    // Storage index of the cell drawn at visible row r, column c.
    const at = (r: number, c: number) => ((r + base) % rows) * cols + c;
    // A cell's brightness in its cycle: a soft rise and fall while it lives, nothing while it rests.
    const shine = (i: number) => (age[i] > 0 && age[i] < life[i] ? Math.sin((Math.PI * age[i]) / life[i]) ** 1.4 : 0);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const a = 0.17 + wake * 0.05;
      for (let r = 0; r < rows; r++) {
        const y = r * CH - oy;
        for (let c = 0; c < cols; c++) {
          const i = at(r, c), x = c * CW;
          const e = shine(i), g = glow[i];
          if (e < 0.02 && g < 0.05) continue;
          const p = near(x, y);
          if (g > 0.05) {
            ctx.fillStyle = seed[i] > 0.88 ? `rgba(126,43,52,${(g * 0.6).toFixed(3)})` : `rgba(169,121,28,${(g * 0.75).toFixed(3)})`;
          } else if ((p > 0.4 && seed[i] < 0.18) || (wake > 0.5 && seed[i] < 0.025)) {
            ctx.fillStyle = `rgba(169,121,28,${(e * (0.3 + p * 0.45)).toFixed(3)})`;
          } else {
            ctx.fillStyle = `rgba(20,18,15,${(e * (a + p * 0.3)).toFixed(3)})`;
          }
          ctx.fillText(chars[i], x + CW / 2, y);
        }
      }
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last < 42) return;
      const sec = last ? Math.min(0.126, (now - last) / 1000) : 0.042;
      const dt = sec / 0.042;
      last = now;
      wake += ((live.current ? 1 : 0) - wake) * Math.min(1, 0.06 * dt);
      ptr.s += ((ptr.on ? 1 : 0) - ptr.s) * Math.min(1, 0.18 * dt);

      // Rise: once a whole row has gone past the top, it becomes the new bottom row, with fresh cycles.
      oy += RISE * sec;
      while (oy >= CH) {
        oy -= CH;
        const gone = base;
        base = (base + 1) % rows;
        for (let c = 0; c < cols; c++) born(gone * cols + c, true);
      }

      // Age every cell; while an agent works the rests run faster, so the field quickens.
      const pace = 1 + wake * 0.8;
      const n = chars.length;
      for (let i = 0; i < n; i++) {
        age[i] += age[i] < 0 ? sec * pace : sec;
        if (age[i] >= life[i]) born(i);
      }

      // Near the pointer, resting cells wake early and living characters turn over: the field gathers around it.
      if (ptr.s > 0.01) {
        const c0 = Math.max(0, ((ptr.x - HOVER * 2) / CW) | 0), c1 = Math.min(cols - 1, ((ptr.x + HOVER * 2) / CW) | 0);
        const r0 = Math.max(0, ((ptr.y + oy - HOVER * 2) / CH) | 0), r1 = Math.min(rows - 1, ((ptr.y + oy + HOVER * 2) / CH) | 0);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = at(r, c), p = near(c * CW, r * CH - oy);
          if (age[i] < 0 && Math.random() < 0.05 * dt * p) age[i] = 0;
          else if (age[i] > 0 && Math.random() < 0.06 * dt * p) chars[i] = pick();
        }
      }

      // Click rings: an ochre band of characters lights up as it passes outward, fading with age.
      for (const ring of rings) {
        ring.age += sec;
        const k = ring.age / RING_LIFE, rad = RING * (1 - (1 - k) ** 3), band = 22, lit = (1 - k) * 0.95;
        const c0 = Math.max(0, ((ring.x - rad - band) / CW) | 0), c1 = Math.min(cols - 1, ((ring.x + rad + band) / CW) | 0);
        const r0 = Math.max(0, ((ring.y + oy - rad - band) / CH) | 0), r1 = Math.min(rows - 1, ((ring.y + oy + rad + band) / CH) | 0);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = at(r, c);
          const dd = Math.abs(Math.hypot(c * CW - ring.x, r * CH - oy - ring.y) - rad);
          if (dd < band && seed[i] < 0.5) {
            const v = lit * (1 - dd / band);
            if (v > glow[i]) { glow[i] = v; chars[i] = pick(); }
          }
        }
      }
      rings = rings.filter((ring) => ring.age < RING_LIFE);
      const fade = Math.pow(0.86, dt);
      for (let i = 0; i < n; i++) if (glow[i] > 0.01) glow[i] *= fade;
      draw();
    };

    size();
    const ro = new ResizeObserver(size);
    if (fixed) window.addEventListener("resize", size);
    else ro.observe(host);
    if (calm) draw();
    else raf = requestAnimationFrame(step);
    const vis = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!document.hidden && !calm) { last = 0; raf = requestAnimationFrame(step); }
    };
    document.addEventListener("visibilitychange", vis);

    // Pointer positions come in screen pixels; the field is laid out unscaled, so map through the host's rect.
    const local = (e: PointerEvent) => {
      if (fixed) return { x: e.clientX, y: e.clientY };
      const r = host.getBoundingClientRect();
      const k = r.width ? w / r.width : 1;
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = local(e);
      ptr.x = p.x; ptr.y = p.y; ptr.on = true;
    };
    const leave = () => { ptr.on = false; };
    const press = (e: PointerEvent) => {
      const p = local(e);
      rings.push({ ...p, age: 0 });
      if (rings.length > 4) rings.shift();
    };
    // On the landing page the content covers the field, so the pointer is followed across the whole window.
    const target: EventTarget = fixed ? window : host;
    const exit: EventTarget = fixed ? document.documentElement : host;
    if (!calm) {
      target.addEventListener("pointermove", move as EventListener, { passive: true });
      exit.addEventListener("pointerleave", leave);
      target.addEventListener("pointerdown", press as EventListener, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("resize", size);
      target.removeEventListener("pointermove", move as EventListener);
      exit.removeEventListener("pointerleave", leave);
      target.removeEventListener("pointerdown", press as EventListener);
    };
  }, [host]);

  return <canvas ref={ref} className="chat-field" aria-hidden />;
}
