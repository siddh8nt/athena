import "server-only";
import { createHash } from "node:crypto";
import { getStore } from "@/lib/store";
import { isEmail, mailReady, sendMail } from "@/lib/mail";
import { readSnapshot } from "./server";
import { DEMO_WS, reserved } from "./demo";
import { thisWeek } from "./week";
import { weekHtml, weekMailText, weekSubject } from "./week-email";

// The Monday email (PRD §23.6 j). A founder turns on "Email me this every Monday" with their address; the
// subscription is kept per workspace, and a list of subscribed workspaces lets the Monday run (app/api/digest/run,
// called by one Cloud Scheduler job) send each founder their This week, read from the mirrored workspace. Judges get
// the Fishwife sample's This week once, at any address they type: one send per address a day, and a daily cap overall.

const SUB = "digest-sub"; // ws -> { email, on, at }
const LIST = "digest-list"; // "all" -> the workspaces that turned it on
const DEMO_SENT = "digest-demo"; // sha(address) -> 1, for a day
const DEMO_COUNT = "digest-demo-n"; // day -> sends that day

const DAY = 24 * 60 * 60 * 1000;
/** The most demo sends in a day, well inside the sending account's own daily limit. */
export const DEMO_DAILY = 50;

export type Sub = { email: string; on: boolean; at: number };

export async function readSub(ws: string): Promise<Sub | undefined> {
  return (await getStore().get<Sub>(SUB, ws))?.value;
}

export async function saveSub(ws: string, email: string, on: boolean): Promise<boolean> {
  if (!ws || reserved(ws) || !isEmail(email)) return false;
  const store = getStore();
  await store.set<Sub>(SUB, ws, { email, on, at: Date.now() });
  const all = (await store.get<string[]>(LIST, "all"))?.value ?? [];
  if (on !== all.includes(ws)) await store.set<string[]>(LIST, "all", on ? [...all, ws] : all.filter((x) => x !== ws));
  return true;
}

type Saved = Parameters<typeof thisWeek>[0];

/** Send one workspace's This week to its founder. */
export async function sendWeek(ws: string, to: string, base?: string, note?: string): Promise<boolean> {
  const saved = (await readSnapshot(ws))?.saved as Saved | undefined;
  if (!saved?.journey) return false;
  const w = thisWeek(saved);
  return sendMail({ to, subject: weekSubject(w), html: weekHtml(w, { base, note }), text: weekMailText(w, { base, note }) });
}

/** The Monday run: every subscribed founder gets their This week. */
export async function sendMondays(base: string): Promise<{ sent: number; of: number }> {
  if (!mailReady()) return { sent: 0, of: 0 };
  const all = (await getStore().get<string[]>(LIST, "all"))?.value ?? [];
  let sent = 0;
  for (const ws of all) {
    const sub = await readSub(ws);
    if (sub?.on && (await sendWeek(ws, sub.email, base, "You turned on this email in Athena's Overview; turn it off there."))) sent++;
  }
  return { sent, of: all.length };
}

/** The judges' Send me this: the Fishwife sample's This week, once per address a day. */
export async function sendDemo(to: string): Promise<"sent" | "already" | "busy" | "bad"> {
  if (!isEmail(to) || !mailReady()) return "bad";
  const store = getStore();
  const who = createHash("sha256").update(to.trim().toLowerCase()).digest("hex");
  if (await store.get(DEMO_SENT, who)) return "already";
  const day = new Date().toISOString().slice(0, 10);
  const n = (await store.get<number>(DEMO_COUNT, day))?.value ?? 0;
  if (n >= DEMO_DAILY) return "busy";
  await store.set<number>(DEMO_COUNT, day, n + 1, 2 * DAY);
  const ok = await sendWeek(DEMO_WS, to.trim(), undefined, "A sample: Fishwife's plan, as seeded for the Athena demo. A founder gets their own every Monday.");
  if (ok) await store.set<number>(DEMO_SENT, who, 1, DAY);
  return ok ? "sent" : "busy";
}
