"use client";

import { useEffect } from "react";

/** Marks whatever is scrolling for a moment, so its scrollbar shows while it moves and fades after. */
export function ScrollFade() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    const on = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el) return;
      el.classList.add("is-scrolling");
      window.clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => el.classList.remove("is-scrolling"), 900));
    };
    document.addEventListener("scroll", on, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", on, { capture: true });
  }, []);
  return null;
}
