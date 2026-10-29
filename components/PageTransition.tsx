import { ViewTransition, type ReactNode } from "react";

// Page to page, every route arrives the same way: the page you leave steps back at once, the next one rises in a beat
// later (the classes are in app/globals.css). Only navigations and a loading shape handing over to its page animate;
// updates inside a page don't. Browsers without view transitions swap pages as before.
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
