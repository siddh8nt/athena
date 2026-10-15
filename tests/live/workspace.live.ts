import { it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Live check of step 7.2's done-when through the real route, on a local server with keys in .env:
//   BASE=http://localhost:3000 SITE=<the brand's site> FILE=<a file of the founder's> pnpm live tests/live/workspace.live.ts
// One box, no fields: the site goes in as text and the file as an upload, like a founder dropping both. It prints
// every step with its time, the longest silence, when the first and full briefs land, and whether the lookups ran in
// parallel. One run: modest on Qloo. Never point it at the prereg-v2 held-out brands. Prints no keys.
const BASE = process.env.BASE ?? "http://localhost:3000";
const SITE = process.env.SITE ?? "";
const FILE = process.env.FILE ?? "";

type Ev = { type: string; event?: { tool: string; why: string; status: string; line?: string; under?: string }; [k: string]: unknown };

it("one box: a site and a file narrate real steps and fill the Brand Graph", async () => {
  const log = (s: string) => console.log(`  ${s}`);
  const ws = randomUUID();
  const hashes: string[] = [];
  if (FILE) {
    const form = new FormData();
    form.set("ws", ws);
    form.set("file", new Blob([readFileSync(FILE)]), path.basename(FILE));
    const j = (await (await fetch(`${BASE}/api/uploads`, { method: "POST", body: form })).json()) as { file?: { hash: string; kept: boolean; status: string } };
    log(`UPLOAD ${path.basename(FILE)}: kept=${j.file?.kept} ${j.file?.status ?? ""}`);
    if (j.file?.kept) hashes.push(j.file.hash);
  }
  const form = new FormData();
  form.set("ws", ws);
  form.set("said", `${SITE} is our site. The file is what we have on the business.`);
  form.set("hashes", JSON.stringify(hashes));
  form.set("struck", "[]");
  form.set("settled", "{}");
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/onboard`, { method: "POST", body: form });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  let buf = "";
  let last = t0;
  let gap = { ms: 0, before: "" };
  const live = new Map<string, number>();
  let overlap = false;
  let pages = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!raw.startsWith("data: ")) continue;
      const e = JSON.parse(raw.slice(6)) as Ev;
      const now = Date.now();
      const what = e.event ? `${e.event.tool}:${e.event.status} ${e.event.line ?? e.event.why}` : e.type;
      if (now - last > gap.ms) gap = { ms: now - last, before: what };
      last = now;
      if (e.type === "event" && e.event) {
        const ev = e.event;
        if (ev.tool === "think") continue;
        if (ev.tool === "read_page" && ev.status !== "running") pages++;
        if (ev.status === "running") live.set(`${ev.tool}:${ev.why}`, now);
        else live.delete(`${ev.tool}:${ev.why}`);
        const tools = new Set([...live.keys()].map((k) => k.split(":")[0]));
        if (tools.has("qloo_search") && tools.has("web_search")) overlap = true;
        log(`${at()}s ${ev.under ? "    " : ""}${ev.tool} ${ev.status}: ${ev.line ?? ev.why}`);
      } else if (e.type === "sorted") log(`${at()}s SORTED websites=${JSON.stringify(e.websites)} pasted=${String(e.pasted ?? "").length} chars`);
      else if (e.type === "checklist") log(`${at()}s CHECKLIST ${(e.items as { step: string; state: string }[]).map((x) => `[${x.state}] ${x.step}`).join(" · ")}`);
      else if (e.type === "knowledge") {
        const k = e.knowledge as { facts: unknown[]; conflicts: { about: string }[] };
        log(`${at()}s KNOWLEDGE ${k.facts.length} facts, ${k.conflicts.length} conflicts: ${k.conflicts.map((c) => c.about).join("; ")}`);
      } else if (e.type === "brief") log(`${at()}s BRIEF${e.early ? " (first, from home and About)" : " (full)"}: ${Object.keys(e.brief as object).join(", ")}`);
      else if (e.type === "ask") log(`${at()}s ASK ${(e.ask as { question: string }).question}`);
    }
  }
  log(`DONE in ${at()}s; ${pages} pages narrated; longest silence ${(gap.ms / 1000).toFixed(1)}s before "${gap.before}"; Qloo and web in parallel: ${overlap}`);
}, 600_000);
