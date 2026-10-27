import type { FounderQuestion } from "@/lib/agent/tools";
import type { Contact } from "@/lib/team/types";
import { profileOf, type ExecItem } from "@/lib/exec/plan";

// The Executive's questions (§23.5 r), as chat question cards. Only Start has no default: the run waits on it. Every
// other one carries on with its first option until the founder picks, so nothing else pauses the run.

/** A question card: `ticked` starts a multi-pick with every option picked. */
export type ExecAsk = FounderQuestion & { id: string; ticked?: boolean };

/** Once Athena's plan is in: the one question the run waits on. */
export const startCard = (k: number): ExecAsk => ({
  id: "exec",
  question: "Your plan is ready. Should the Executive start on it?",
  why: `It finds how to reach all ${k} item${k === 1 ? "" : "s"}, Now first, and writes the drafts. Nothing is sent: you send each one yourself.`,
  options: [
    { label: "Start now", hint: "Rows fill in live on the Executive page as each contact and its drafts land" },
    { label: "Later", hint: "Start waits on the Executive page" },
  ],
  multi: false,
  assumed: "",
});

/** A profile's button text: its handle, else its link. */
export const handleOf = (url: string) => {
  const pr = profileOf(url);
  return pr ? `@${pr.handle}` : url;
};

/** Two or three profiles on one site that look like theirs; the first is on the row until the founder picks. */
export const profileCard = (c: Contact): ExecAsk => {
  const options = c.ask?.options ?? [];
  const n = options.length;
  const site = c.ask?.site ?? "";
  return {
    id: `exec-profile:${c.key}`,
    question: `${n === 2 ? "Two" : "Three"} ${site} accounts look like ${c.name}'s: which one?`,
    why: `Their own pages link ${n === 2 ? "both" : "all three"}. The drafts stay the same; only the ${site} button changes.`,
    options: options.map((o) => ({ label: handleOf(o.url), hint: `Linked from ${o.src.label}` })),
    multi: false,
    unranked: true,
    assumed: options[0] ? handleOf(options[0].url) : "",
  };
};

/** Places that list only a phone. */
export const phoneCard = (its: ExecItem[]): ExecAsk => ({
  id: "exec-phone",
  question: `${its.length} ${its.every((i) => i.kind === "venue" || i.kind === "retailer") ? "shops" : "places"} list only a phone: write call scripts for them?`,
  why: "Their pages give no email, form or profile, so a call or a visit is the way in.",
  options: [
    { label: "Write call scripts", hint: "Each row shows the number first, with its script" },
    { label: "Walk in instead", hint: "Each row shows the address first, with the same script for a visit" },
  ],
  multi: false,
  assumed: "Write call scripts",
});

/** Drafts opened in the mail or DM app and not yet marked: every one ticked. */
export const sentCard = (its: ExecItem[]): ExecAsk | undefined => {
  const names = [...new Set(its.map((it) => it.name))].slice(0, 8);
  if (!names.length) return undefined;
  return {
    id: `exec-sent-${its.filter((it) => names.includes(it.name)).map((it) => it.id).join("|")}`,
    question: names.length === 1 ? `Did your message to ${names[0]} go out?` : "Did these go out?",
    why: "Ticked ones move to Sent, and a follow-up comes up if there's no reply.",
    options: names.map((label) => ({ label })),
    multi: true,
    ticked: true,
    unranked: true,
    assumed: names.length === 1 ? names[0] : "All of them",
  };
};

/** Pitches past their wait: each follow-up is already drafted on its row. */
export const followCard = (its: ExecItem[], days: number): ExecAsk => ({
  id: `exec-follow-${its.map((i) => i.id).join("|")}`,
  question: its.length === 1 ? `${its[0].name} hasn't replied in ${days} days. Send the follow-up?` : `${its.length} pitches have had no reply past their wait. Send the follow-ups?`,
  why: "Each follow-up is already drafted on its row, ready to copy.",
  options: [
    { label: "Show the follow-ups", hint: "On the Executive page, under Follow-up" },
    { label: "Wait another week", hint: "They come up again in seven days" },
  ],
  multi: false,
  assumed: "Show the follow-ups",
});

/** The first pitch: how long to wait for a reply before the plan brings it up again (§23.5 q). */
export const waitCard: ExecAsk = {
  id: "exec-wait",
  question: "When should I bring up a pitch with no reply?",
  why: "Until then it shows as waiting on a reply; after that, its row on the Executive plan offers a follow-up.",
  options: [{ label: "1 week" }, { label: "Choose", hint: "A length, or a rule for some items" }],
  multi: false,
  assumed: "1 week",
};
