"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The product's backdrop: a very faint, even scatter of small mono characters, each fading in at its own random moment,
// holding briefly and fading out, while the whole field rises slowly. It answers the pointer with a lens of light that
// glides after it: under the lens the hidden characters show, denser and warmer toward its middle, the grid parts softly
// around it, and characters its middle reaches scramble briefly and settle. The lens widens a little while the pointer
// moves fast, leaves a wake that cools behind it, and gathers back in when the pointer rests. A click sends an ochre ring
// rippling out through the same characters. While an agent works the field quickens a little (shorter rests, a few ochre
// glints) and settles back when the work ends. Visual only: it reads nothing but the page's own "working" marks and its
// background colour, and it mounts itself into whichever chat surface is on screen. On the landing page it covers the
// window, fixed behind the scrolling content; the titles keep their own clearings. One canvas, one requestAnimationFrame
// loop: the display's own rate while the pointer moves or a ring spreads, ~24 frames a second at rest, paused while the
// tab is hidden; a still frame under prefers-reduced-motion.

const HOST = ".ob-first, .ob-work, .journey-main.agent-stage, .landing-page";
const LANDING = ".landing-page";
const WORKING = ".ob-live, .ob-think, .ob-agent-live, .streaming, .typing, .step-running, .live-steps .step-active, .team-working";
// A machine's vocabulary, never more than two characters: hex bytes, bit pairs and short pieces of code syntax, so from a
// distance the field reads as code. Repeating a set raises how often it shows.
const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).toUpperCase().padStart(2, "0"));
const BITS = ["00", "01", "10", "11"];
const SYNTAX = ["{}", "[]", "()", "=>", "!=", "==", "&&", "||", "//", "/*", "*/", "<>", "::", "->", "++", "+=", "0x", "\\n", "fn", "if", "?:", ";", "#", "$", "%", "@", "&", "|", "~", "^"];
const TOKENS = [...HEX, ...Array(16).fill(BITS).flat(), ...Array(3).fill(SYNTAX).flat()];
// A cell, and how far below a cell's top its glyph's middle sits (11px type set from the top).
const CW = 22, CH = 16, MID = 6;

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
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    // The landing page scrolls under a window-sized field; the product screens carry the field on their own surface.
    const fixed = host.matches(LANDING);
    if (fixed) cv.classList.add("chat-field-fixed");

    let w = 0, h = 0, cols = 0, rows = 0;
    // Each cell lives its own cycle: dark for a random rest, then its character fades in, holds a moment and fades out,
    // and the next cycle draws a new character and a new rest. So at any moment a thin, even scatter is showing, and which
    // characters make it up keeps changing; nothing settles into fixed shapes or fixed holes.
    let chars: string[] = [], age = new Float32Array(0), life = new Float32Array(0);
    let glow = new Float32Array(0), seed = new Float32Array(0);
    // Per cell for the field's whole life: a fixed draw (`mark`) that decides how near the lens's middle it must be to show
    // and which colour it takes, so nothing pops when its cycle turns over; the lens's warmth on it (`heat`); whether the
    // lens's middle has already scrambled it (`seen`); and a short scramble still to play (`flip` characters, one every `tick`).
    let mark = new Float32Array(0), heat = new Float32Array(0), tick = new Float32Array(0);
    let flip = new Uint8Array(0), seen = new Uint8Array(0);
    let wake = live.current ? 1 : 0;
    let raf = 0, last = 0, moved = -1e9;
    // The whole field rises very slowly; rows that leave the top come back in at the bottom, fresh.
    let oy = 0, base = 0;
    // The pointer in field coordinates; the lens that glides after it, with an eased presence (s) and an eased speed (v, 0 to
    // 1); how far the lens reaches this frame; and the rings that clicks send out.
    const ptr = { x: 0, y: 0, on: false };
    const lens = { x: 0, y: 0, s: 0, v: 0 };
    let reach = 0;
    let rings: { x: number; y: number; age: number }[] = [];
    const LENS = 90, SPREAD = 0.3, PUSH = 6, COOL = 0.45, RING = 520, RING_LIFE = 1.1, RISE = 5;
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
      mark = new Float32Array(n); heat = new Float32Array(n); tick = new Float32Array(n);
      flip = new Uint8Array(n); seen = new Uint8Array(n);
      for (let i = 0; i < n; i++) { born(i, true); mark[i] = Math.random(); }
      oy = 0; base = 0;
      if (calm) draw();
    };

    // Colours follow the surface: dark ink on the light page, warm light ink on the dark one (where dark ink left only the
    // ochre showing). Ochre and wine are the brand's, a shade brighter in the dark. Each colour is a fixed string and its
    // strength goes through globalAlpha, so a frame builds no strings; the lens's ink-to-ochre blend is held as 17 steps.
    let blend: string[] = [], ochre = "", wine = "", ink = 0.17, lift = 0.32;
    // The conversation sits on clear glass, so the field runs at one strength everywhere and shows through it (founder, 17 Oct).
    const paint = () => {
      const fill = (el: Element) => getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number);
      const bg = [host, document.body, document.documentElement].map(fill).find((c) => c && c.length >= 3 && (c[3] ?? 1) > 0.5);
      const dark = bg ? (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 < 0.4 : scheme.matches;
      const from = dark ? [243, 239, 230] : [20, 18, 15], to = dark ? [217, 164, 65] : [169, 121, 28];
      const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(",")})`;
      blend = Array.from({ length: 17 }, (_, k) => rgb(from.map((v, j) => v + ((to[j] - v) * k) / 16)));
      ochre = blend[16];
      wine = rgb(dark ? [184, 78, 90] : [126, 43, 52]);
      [ink, lift] = dark ? [0.11, 0.26] : [0.17, 0.32];
      if (calm) draw();
    };

    // The lens's pull on a cell whose glyph is centred at (x, y): 0 far away, up to 1 under its middle.
    const near = (x: number, y: number) => {
      const dx = x - lens.x, dy = y - lens.y;
      return lens.s * Math.exp(-(dx * dx + dy * dy) / (2 * reach * reach));
    };
    // Storage index of the cell drawn at visible row r, column c.
    const at = (r: number, c: number) => ((r + base) % rows) * cols + c;
    // The visible rows and columns whose cells lie within `span` of (x, y).
    const box = (x: number, y: number, span: number) => [
      Math.max(0, Math.floor((x - span) / CW)), Math.min(cols - 1, Math.ceil((x + span) / CW)),
      Math.max(0, Math.floor((y + oy - span) / CH)), Math.min(rows - 1, Math.ceil((y + oy + span) / CH)),
    ];
    // A cell's brightness in its cycle: a soft rise and fall while it lives, nothing while it rests.
    const shine = (i: number) => (age[i] > 0 && age[i] < life[i] ? Math.sin((Math.PI * age[i]) / life[i]) ** 1.4 : 0);
    // A few quick character changes that end on a settled one: how the field reads a character in.
    const scramble = (i: number, times: number) => {
      if (flip[i] < times) { flip[i] = times; tick[i] = Math.random() * 0.04; }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const a = ink * (1 + wake * 0.3);
      let cur = "";
      for (let r = 0; r < rows; r++) {
        const y = r * CH - oy;
        for (let c = 0; c < cols; c++) {
          const i = at(r, c);
          const e = shine(i), g = glow[i], q = heat[i];
          if (e < 0.02 && g < 0.05 && q < 0.03) continue;
          // Under the lens a cell shows whatever its cycle: the ones with a low mark already at the lens's rim, all but a
          // few at its middle, so its edge is a loose scatter and its middle is dense.
          const shown = q < 0.03 ? 0 : Math.min(1, Math.max(0, (q - mark[i] * 0.95) / 0.25));
          let alpha = Math.max(e * a, shown * (a + q * lift)), fill: string;
          if (g * 0.75 > alpha) {
            const red = mark[i] > 0.88;
            fill = red ? wine : ochre; alpha = g * (red ? 0.6 : 0.75);
          } else if (wake > 0.5 && seed[i] < 0.025) {
            fill = ochre; alpha = Math.max(alpha, e * 0.3);
          } else {
            // The lens's middle warms toward ochre: about a third of its characters fully, the rest only tinted. Ochre has
            // less contrast than the ink on either page, so a warm character is drawn stronger to read as lit, not faded.
            const warm = q > 0.4 ? ((q - 0.4) / 0.6) ** 1.5 * ((mark[i] * 7.31) % 1 < 0.3 ? 1 : 0.4) : 0;
            fill = blend[(warm * 16 + 0.5) | 0]; alpha *= 1 + warm * 0.7;
          }
          if (alpha < 0.01) continue;
          // The grid parts around the lens: characters ease away from its middle, most at mid-radius, and drift back as
          // their warmth cools.
          let x = c * CW + CW / 2, ty = y;
          if (q > 0.03) {
            const dx = x - lens.x, dy = y + MID - lens.y, d = Math.hypot(dx, dy) || 1;
            const m = (PUSH * 4 * q * (1 - q) * Math.min(1, d / 20)) / d;
            x += dx * m; ty += dy * m;
          }
          if (fill !== cur) ctx.fillStyle = cur = fill;
          ctx.globalAlpha = alpha;
          ctx.fillText(chars[i], x, ty);
        }
      }
      ctx.globalAlpha = 1;
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      // The display's own rate while the pointer moves, the lens settles or a ring spreads; ~24 frames a second at rest.
      const hot = now - moved < 1600 || rings.length > 0;
      if (now - last < (hot ? 15 : 42)) return;
      const sec = last ? Math.min(0.126, (now - last) / 1000) : 0.042;
      const dt = sec / 0.042;
      const ease = (rate: number) => 1 - Math.exp(-sec * rate);
      last = now;
      wake += ((live.current ? 1 : 0) - wake) * Math.min(1, 0.06 * dt);

      // The lens fades in and out with the pointer, glides after it, and reaches a little further while it moves fast.
      const lx = lens.x, ly = lens.y;
      lens.s += ((ptr.on ? 1 : 0) - lens.s) * ease(6);
      lens.x += (ptr.x - lens.x) * ease(14); lens.y += (ptr.y - lens.y) * ease(14);
      lens.v += (Math.min(1, Math.hypot(lens.x - lx, lens.y - ly) / sec / 1400) - lens.v) * ease(5);
      reach = LENS * (1 + SPREAD * lens.v);

      // Rise: once a whole row has gone past the top, it becomes the new bottom row, with fresh cycles.
      oy += RISE * sec;
      while (oy >= CH) {
        oy -= CH;
        const gone = base;
        base = (base + 1) % rows;
        for (let c = 0; c < cols; c++) {
          const i = gone * cols + c;
          born(i, true);
          heat[i] = glow[i] = 0; flip[i] = seen[i] = 0;
        }
      }

      // Age every cell; while an agent works the rests run faster, so the field quickens. The lens's warmth cools on every
      // cell (what it leaves behind is its wake), and scrambles play out.
      const pace = 1 + wake * 0.8, cool = Math.exp(-sec / COOL);
      const n = chars.length;
      for (let i = 0; i < n; i++) {
        age[i] += age[i] < 0 ? sec * pace : sec;
        if (age[i] >= life[i]) born(i);
        if (heat[i]) {
          heat[i] = heat[i] > 0.002 ? heat[i] * cool : 0;
          if (seen[i] && heat[i] < 0.3) seen[i] = 0;
        }
        if (flip[i] && (tick[i] -= sec) <= 0) { chars[i] = pick(); flip[i]--; tick[i] = 0.045 + Math.random() * 0.045; }
      }

      // Under the lens the warmth rises toward its pull. A character its middle reaches scrambles once and settles; while
      // the lens rests, its middle keeps turning a character over now and then.
      if (lens.s > 0.01) {
        const [c0, c1, r0, r1] = box(lens.x, lens.y, reach * 2.4), warm = ease(18);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = at(r, c), t = near(c * CW + CW / 2, r * CH - oy + MID);
          if (t > heat[i]) heat[i] += (t - heat[i]) * warm;
          if (heat[i] >= 0.5 && !seen[i]) { seen[i] = 1; scramble(i, 2 + ((mark[i] * 3) | 0)); }
          else if (heat[i] > 0.6 && !flip[i] && Math.random() < sec * 0.25) scramble(i, 1);
        }
      }

      // Click rings: an ochre band of characters lights up as it passes outward, each one scrambling as the band reaches
      // it, fading with age.
      for (const ring of rings) {
        ring.age += sec;
        const k = ring.age / RING_LIFE, rad = RING * (1 - (1 - k) ** 3), band = 22, lit = (1 - k) * 0.95;
        const [c0, c1, r0, r1] = box(ring.x, ring.y, rad + band);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const i = at(r, c);
          const dd = Math.abs(Math.hypot(c * CW + CW / 2 - ring.x, r * CH - oy + MID - ring.y) - rad);
          if (dd < band && mark[i] < 0.5) {
            const v = lit * (1 - dd / band);
            if (v > glow[i]) {
              if (glow[i] < 0.12 && v >= 0.12) scramble(i, 2 + ((mark[i] * 4) | 0) % 2);
              glow[i] = v;
            }
          }
        }
      }
      rings = rings.filter((ring) => ring.age < RING_LIFE);
      const fade = Math.pow(0.86, dt);
      for (let i = 0; i < n; i++) if (glow[i] > 0.01) glow[i] *= fade;
      draw();
    };

    paint();
    size();
    const ro = new ResizeObserver(size);
    if (fixed) window.addEventListener("resize", size);
    else ro.observe(host);
    scheme.addEventListener("change", paint);
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
      // Coming back after the lens has faded, it opens where the pointer is instead of gliding over from where it left.
      if (lens.s < 0.02) { lens.x = p.x; lens.y = p.y; }
      ptr.x = p.x; ptr.y = p.y; ptr.on = true;
      moved = performance.now();
    };
    const leave = () => { ptr.on = false; moved = performance.now(); };
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
      scheme.removeEventListener("change", paint);
      target.removeEventListener("pointermove", move as EventListener);
      exit.removeEventListener("pointerleave", leave);
      target.removeEventListener("pointerdown", press as EventListener);
    };
  }, [host]);

  return <canvas ref={ref} className="chat-field" aria-hidden />;
}
