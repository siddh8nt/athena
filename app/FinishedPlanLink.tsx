"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import s from "./landing.module.css";

// A quiet second way in under Get started: the finished Fishwife sample plan, view only. It asks once whether the
// sample is seeded and shows only if it is, so it never leads to an empty page. It joins the hero's entry where it
// would have arrived, never ahead of the button.

const ENTRY_MS = 1150;

export default function FinishedPlanLink({ href }: { href: string }) {
  const [delay, setDelay] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/workspace/demo")
      .then((r) => r.json() as Promise<{ ok?: boolean }>)
      .then((d) => live && d.ok && setDelay(Math.max(0, ENTRY_MS - performance.now())))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (delay === null) return null;
  return (
    <Link href={href} className={s.sample} style={{ animationDelay: `${Math.round(delay)}ms` }}>
      or see a finished plan <span aria-hidden>→</span>
    </Link>
  );
}
