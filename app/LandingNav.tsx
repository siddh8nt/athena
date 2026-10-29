"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import { ThemeToggle } from "@/components/SideNav";

// The landing page's top bar: a floating capsule that tightens once the page scrolls, with a gold hairline along its
// lower edge that tracks how far down the page the reader is, and a marker that slides under the section in view.

const SECTIONS = [
  { id: "at-work", label: "At work" },
  { id: "why", label: "Why Athena" },
];

// Glide to a section instead of jumping, unless the reader prefers less motion.
function glide(e: React.MouseEvent, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
}

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The page always opens at the top, with the bar above the hero, so the entry plays as designed. A reload would
    // otherwise come back mid-page, with the bar sitting over the hero. A link to a section still goes to it.
    history.scrollRestoration = "manual";
    if (!location.hash) scrollTo(0, 0);
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.current?.style.setProperty("--progress", String(max > 0 ? Math.min(1, scrollY / max) : 0));
      setScrolled(scrollY > 24);
      document.documentElement.toggleAttribute("data-scrolled", scrollY > 24);
      let current: string | null = null;
      for (const sec of SECTIONS) {
        const el = document.getElementById(sec.id);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.5) current = sec.id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(raf); document.documentElement.removeAttribute("data-scrolled"); history.scrollRestoration = "auto"; };
  }, []);

  return (
    <header className={s.top}>
      <div ref={bar} className={`${s.capsule} ${scrolled ? s.scrolled : ""}`}>
        <Link href="/" className={s.mark} aria-label="Athena">
          <span className={s.dots} aria-hidden><i /><i /></span>
          Athena
        </Link>
        <nav className={s.links} aria-label="On this page">
          {SECTIONS.map((sec) => (
            <a key={sec.id} href={`#${sec.id}`} className={active === sec.id ? s.on : undefined} onClick={(e) => glide(e, sec.id)}>{sec.label}</a>
          ))}
        </nav>
        <ThemeToggle className={s.themeBtn} />
        <Link href="/plan?new=1" className={s.small}>Get started <span aria-hidden>→</span></Link>
        <span className={s.progress} aria-hidden />
      </div>
    </header>
  );
}
