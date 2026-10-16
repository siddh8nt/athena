"use client";

import { useEffect, useRef, type ReactNode } from "react";
import s from "./landing.module.css";

// The landing hero box and its living glow: three soft lights that chase the pointer at different speeds, stretch along
// the direction of travel, and brighten while the pointer is over the box. With no pointer, they drift slowly around
// the top-right corner. One requestAnimationFrame loop, transforms only, paused while the hero is off screen.

type Blob = { x: number; y: number; vx: number; vy: number; stiff: number; damp: number };

export default function HeroGlow({ className, children }: { className: string; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const lights = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Springs: the core is quick, the gold body follows, the oxblood halo trails behind.
    const blobs: Blob[] = [
      { x: 0, y: 0, vx: 0, vy: 0, stiff: 0.075, damp: 0.78 },
      { x: 0, y: 0, vx: 0, vy: 0, stiff: 0.035, damp: 0.84 },
      { x: 0, y: 0, vx: 0, vy: 0, stiff: 0.016, damp: 0.88 },
    ];
    let w = el.clientWidth, h = el.clientHeight;
    const target = { x: w * 0.82, y: h * 0.2 };
    let hovering = false, energy = 0, raf = 0, visible = true, last = performance.now();
    blobs.forEach((b) => { b.x = target.x; b.y = target.y; });

    const resize = () => { w = el.clientWidth; h = el.clientHeight; };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      hovering = true;
    };
    const leave = () => { hovering = false; };

    const tick = (now: number) => {
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      if (!hovering) {
        // Idle drift: a slow figure-of-eight around the top-right corner.
        const t = now / 1000;
        target.x = w * (0.78 + 0.1 * Math.sin(t * 0.37)) + 40 * Math.sin(t * 0.91);
        target.y = h * (0.26 + 0.14 * Math.cos(t * 0.29)) + 30 * Math.sin(t * 0.63);
      }
      energy += ((hovering ? 1 : 0) - energy) * 0.06 * dt;

      blobs.forEach((b, i) => {
        b.vx = (b.vx + (target.x - b.x) * b.stiff * dt) * Math.pow(b.damp, dt);
        b.vy = (b.vy + (target.y - b.y) * b.stiff * dt) * Math.pow(b.damp, dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const node = lights.current[i];
        if (!node) return;
        const speed = Math.hypot(b.vx, b.vy);
        const stretch = Math.min(speed / 28, 0.55);
        const angle = Math.atan2(b.vy, b.vx);
        const grow = 1 + energy * (i === 0 ? 0.25 : 0.15);
        node.style.transform =
          `translate3d(${b.x}px, ${b.y}px, 0) translate(-50%, -50%) rotate(${angle}rad) ` +
          `scale(${grow * (1 + stretch)}, ${grow * (1 - stretch * 0.45)})`;
        node.style.opacity = String(0.55 + 0.45 * energy + Math.min(speed / 60, 0.15));
      });
      if (visible) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) { last = performance.now(); raf = requestAnimationFrame(tick); }
    });
    io.observe(el);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <section ref={root} className={className}>
      <span className={s.glow} aria-hidden>
        <span ref={(n) => { lights.current[2] = n; }} className={s.halo} />
        <span ref={(n) => { lights.current[1] = n; }} className={s.body} />
        <span ref={(n) => { lights.current[0] = n; }} className={s.core} />
      </span>
      {children}
    </section>
  );
}
