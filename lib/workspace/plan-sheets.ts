import type { BrandBrief } from "@/lib/brief/types";
import type { CrowdCard, Journey } from "@/lib/journey/types";
import { briefFacts } from "@/lib/brief/facts";
import { nameOf, type SpecialistId } from "@/lib/agent/specialists";
import { KIND_LABEL } from "@/lib/agent/synthesis";
import { contactOf, execPlan, norm, stageOf, statesOf, waitOf, type ExecItem, type ExecPlan } from "@/lib/exec/plan";
import { TIER_LABEL, type Block, type CrowdPage, type Row, type Section } from "@/lib/team/page";
import { emptyTeam, markLabel, TASK_LABEL, type Field, type PlanLine, type TeamState } from "@/lib/team/types";
import { salesByPlace, salesLine } from "@/lib/sales/orders";
import { PHASE, STAGE_NOTE } from "./brand-file";
import { sheetNames, xlsx, type Cell, type Sheet } from "./xlsx";
import { whereFor, type Where } from "./where";

// The plan spreadsheet (athena-plan.xlsx): the brand file's companion, for the founder and their team rather than an
// AI assistant. One tab each for the outreach with every contact found and where it stands, the drafts, Athena's plan,
// the crowds, each subagent's tables and findings, the results and what was left out. Built in the browser from the
// saved journey, so it costs nothing; the judges' demo builds it on the server from the seeded workspace. A subagent
// that hasn't run has no tab, a column nothing fills is left out, and everything is named in words, never by id.
// Every tab says where each row came from, in the words the app's cards use (§23.8 e).

export const PLAN_FILE = "athena-plan.xlsx";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DAY = 24 * 60 * 60 * 1000;
const day = (ms?: number): Cell => (ms ? { day: new Date(ms).toISOString().slice(0, 10) } : undefined);
const cap = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
const list = (xs: (string | undefined)[], sep = ", ") => xs.filter(Boolean).join(sep);

/** A sheet with its header, leaving out the columns no row fills (a page's "—" is a blank). */
function table(name: string, head: string[], rows: Cell[][]): Sheet | undefined {
  if (!rows.length) return undefined;
  const keep = head.map((_, i) => rows.some((r) => r[i] != null && r[i] !== "" && r[i] !== "—"));
  return { name, rows: [head.filter((_, i) => keep[i]), ...rows.map((r) => r.filter((_, i) => keep[i]))] };
}

/** What a result is, in words: a Rep venue is a shop, with its type when the page gave one ("Shop (bakery)"). */
const KIND: Record<string, string> = {
  venue: "Shop",
  retailer: "Retailer",
  partner: "Brand",
  creator: "Creator",
  podcast: "Podcast",
  event: "Event",
  audience: "Community",
  moment: "Moment",
  show: "Show",
  message: "Words",
  neighbourhood: "Neighbourhood",
  city: "City",
  step: "Step",
  rival: "Rival",
  crowd: "Crowd",
};
const OUTREACH_KINDS = new Set(["venue", "retailer", "partner", "creator", "podcast", "event"]);
function kindOf(it: { kind: string; group?: string }): string {
  const k = KIND[it.kind] ?? cap(it.kind);
  const g = it.group?.trim();
  return g && OUTREACH_KINDS.has(it.kind) && norm(g) !== norm(it.kind) && norm(g) !== norm(k) ? `${k} (${g})` : k;
}

/** Where a result came from, as a cell: the source in words, then its page. */
const fromCell = (where: Where, it: { id?: string; name: string; agent?: string }) => {
  const w = where.item(it);
  return w && list([cap(w.from), w.url], "\n");
};

/** Athena's order: Now first, in her steps' order, then each subagent's own ranking. */
const inOrder = (a: ExecItem, b: ExecItem) => (a.now?.order ?? 1e9) - (b.now?.order ?? 1e9) || a.rank - b.rank;

const AGE: Record<string, string> = { "24_and_younger": "24 and under", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+" };
/** A crowd's age and gender lean, as the Matchmaker words it. */
function leanOf(skew?: CrowdCard["skew"]): string {
  if (!skew?.clear) return "";
  const top = Object.entries(skew.age).filter(([k]) => AGE[k]).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.1).slice(0, 2).map(([k]) => AGE[k]);
  const f = skew.gender.female ?? (skew.gender.male !== undefined ? -skew.gender.male : 0);
  return list([top.length ? `Leans ${top.join(" and ")}` : "", f >= 0.1 ? "leans women" : f <= -0.1 ? "leans men" : ""]);
}

function outreach(team: TeamState, items: ExecItem[], now: number, where: Where): Sheet | undefined {
  const x = team.exec;
  const st = statesOf(team);
  const pitched = new Map<string, number>();
  for (const o of team.outcomes ?? []) if (o.mark === "pitched") pitched.set(o.item, Math.max(pitched.get(o.item) ?? 0, o.at));
  const head = ["Plan step", "Name", "Type", "Subagent", "Crowds", "Cities", "What to do", "Where it stands", "Pitched on", "Follow up from", "Event date", "Email", "Phone", "Website", "Contact form", "DMs", "Address", "Where it came from", "Where the contact came from", "Spent ($)", "Brand-fit note"];
  const rows = items.map((it): Cell[] => {
    const s = st(it.id);
    const c = contactOf(it, x);
    const fields: [string, Field | undefined][] = [["Email", c?.email], ["Phone", c?.phone], ["Website", c?.website], ["Contact form", c?.form], ["Address", c?.address], ...(c?.social ?? []).map((f): [string, Field] => [f.label, f])];
    const from = fields.flatMap(([label, f]) => (f ? [`${label}: ${f.src.label}${f.src.url && f.src.url !== f.value ? ` (${f.src.url})` : ""}`] : []));
    return [
      it.now?.step,
      it.name,
      kindOf(it),
      nameOf(it.agent),
      it.crowds.join(", "),
      it.cities.join(", "),
      it.action,
      cap(STAGE_NOTE[stageOf(it, s, x, now)]),
      day(pitched.get(it.id)),
      s.mark === "pitched" && s.at != null ? day(s.at + waitOf(it, x).days * DAY) : undefined,
      it.kind === "event" && it.date ? { day: it.date } : undefined,
      c?.email?.value,
      c?.phone?.value,
      c?.website?.value,
      c?.form?.value,
      list(c?.social.map((f) => `${f.label}: ${f.value}`) ?? [], "\n"),
      c?.address?.value,
      fromCell(where, it),
      from.join("\n"),
      x?.spend?.[it.id]?.usd,
      it.caution,
    ];
  });
  return table("Outreach", head, rows);
}

function drafts(team: TeamState, items: ExecItem[], where: Where): Sheet | undefined {
  const rows = items.flatMap((it): Cell[][] => {
    const d = team.exec?.drafts[it.id];
    const page = it.detail?.draft;
    if (!d && !page?.body) return [];
    const call = d && list([d.call.opener && `Opener: ${d.call.opener}`, d.call.why && `Why them: ${d.call.why}`, d.call.offer && `The offer: ${d.call.offer}`, d.call.send && `If they ask you to send something: ${d.call.send}`, d.call.close && `Close: ${d.call.close}`], "\n\n");
    return [[it.now?.step, it.name, nameOf(it.agent), contactOf(it, team.exec)?.email?.value, d?.email.subject ?? page?.subject, d?.email.body ?? page?.body, d?.dm, call, fromCell(where, it)]];
  });
  return table("Drafts", ["Plan step", "Name", "Subagent", "Send to", "Email subject", "Email", "DM", "Call or walk-in script", "Where it came from"], rows);
}

function tasks(team: TeamState, items: ExecItem[], where: Where): Sheet | undefined {
  const st = statesOf(team);
  const rows = items.map((it): Cell[] => {
    const s = st(it.id);
    return [it.now?.step, it.action, kindOf(it), nameOf(it.agent), it.crowds.join(", "), it.cities.join(", "), TASK_LABEL[s.status], s.mark && markLabel(s.mark, s.by), it.note, fromCell(where, it)];
  });
  return table("Other tasks", ["Plan step", "Task", "Type", "Subagent", "Crowds", "Cities", "Status", "Result", "Note", "Where it came from"], rows);
}

function planSheet(team: TeamState, plan: ExecPlan, where: Where): Sheet | undefined {
  const kinds = Object.keys(KIND_LABEL) as PlanLine["kind"][];
  const rows = (team.plan?.steps ?? []).map((s): Cell[] => {
    const named = (s.items ?? []).map((i) => plan.byId.get(i.id)?.name ?? i.name);
    return [
      s.n,
      cap(PHASE[s.phase]),
      s.crowds.join(", "),
      s.what,
      ...kinds.map((k) => list(s.lines.filter((l) => l.kind === k).map((l) => l.text), "\n")),
      s.depends.join(", "),
      list([...new Set(named)].slice(0, 40)),
      list(s.notes ?? [], "\n"),
      list([...new Set(s.lines.flatMap((l) => (l.url ? [l.url] : l.agent && where.agent(l.agent) ? [`${nameOf(l.agent)}: ${where.agent(l.agent)}`] : [])))], "\n"),
    ];
  });
  return table("Plan", ["Step", "For", "Crowds", "What", ...kinds.map((k) => KIND_LABEL[k]), "After steps", "What it works on", "Where the subagents disagree", "Where it came from"], rows);
}

function crowds(journey: Journey | undefined, where: Where): Sheet | undefined {
  const cards = (journey?.crowds?.crowds ?? []).filter((c) => !c.nearMiss);
  const fits = journey?.fits?.fits.fits ?? [];
  const reasons = journey?.fits?.answer.reasons ?? [];
  const fitOf = (c: CrowdCard) => fits.find((f) => f.crowd === c.id) ?? fits.find((f) => norm(f.name) === norm(c.name));
  const ranked = cards.map((c) => ({ c, f: fitOf(c) })).sort((a, b) => (a.f?.rank ?? 1e9) - (b.f?.rank ?? 1e9));
  const rows = ranked.map(({ c, f }, i): Cell[] => {
    const said = reasons.filter((r) => r.crowd === c.id).map((r) => r.text);
    return [
      f?.rank ?? i + 1,
      c.name,
      c.after?.join(" and "),
      c.shared,
      f && TIER_LABEL[f.tier],
      c.main ? "Yes" : "",
      list(said.length ? said : (f?.reasons ?? []).slice(0, 3), "\n"),
      f?.when,
      leanOf(c.skew),
      list(c.loves.slice(0, 12).map((l) => l.name)),
      list(c.cities.slice(0, 6).map((m) => m.name)),
      cap(where.crowd(c) ?? ""),
    ];
  });
  return table("Crowds", ["Rank", "Crowd", "Named after", "What they share (Athena's read)", "Tier", "Main crowd", "Why it fits", "When", "Leans", "Also loves", "Strongest cities", "Where it came from"], rows);
}

/** The subagents with a page, in the order a founder reads them. The Analyst's crowds are the Crowds tab. */
const PAGES: SpecialistId[] = ["scout", "navigator", "rep", "matchmaker", "promoter"];

/** A page title as a tab name: its count dropped ("Every matching shop (32)"). */
const titleOf = (s: string) => s.replace(/\s*\(\d[\d,]*\)\s*$/, "").trim();

/** A tab name that fits Excel's 31 characters (and no colon, which it refuses): the subagent's name, then as much of
 *  the title as fits, from its end ("Navigator – Hot neighbourhood"). */
function tabName(agent: string, title: string): string {
  let words = title.split(" ");
  while (words.length > 1 && `${agent} – ${words.join(" ")}`.length > 31) words = words.slice(1);
  return `${agent} – ${cap(words.join(" "))}`;
}

type Grid = { title: string; cols: string[]; rows: Map<string, { cells: Record<string, string>; crowds: Set<string>; parts: Set<string>; links: string; from?: string }> };

/** One subagent's page as tabs: each table (and the calendar's list) as its own, merged across the crowd tabs and
 *  sections it appears in, then everything else it found (names, words, notes) as one more. */
function pageSheets(agent: SpecialistId, page: CrowdPage, where: Where): { sheet: Sheet; about: string }[] {
  const who = nameOf(agent);
  const grids = new Map<string, Grid>();
  const found: Cell[][] = [];
  const seen = new Set<string>();
  // What the page itself read ("Qloo's taste graph", "the U.S. Census"), for a row no result says more about.
  let pageFrom = "";
  const say = (crowd: string, part: string, group: string | undefined, what: string | undefined, why?: string, item?: string) => {
    if (!what?.trim()) return;
    const key = [crowd, part, group, what, why].join("\u0001");
    const from = (item && fromCell(where, { id: item, name: what, agent })) || cap(pageFrom);
    if (!seen.has(key)) seen.add(key), found.push([crowd, part, group, what, why, from]);
  };
  const grid = (sec: Section, label: string | undefined, columns: string[], rows: Row[], crowd?: string) => {
    const title = titleOf(label || sec.title);
    const g: Grid = grids.get(title) ?? { title, cols: [], rows: new Map() };
    grids.set(title, g);
    for (const c of columns) if (!g.cols.includes(c)) g.cols.push(c);
    const part = label && titleOf(label) !== titleOf(sec.title) ? sec.title : "";
    for (const r of rows) {
      const key = columns.map((c, i) => `${c}=${r.cells[i] ?? ""}`).join("\u0001");
      const had = g.rows.get(key) ?? { cells: Object.fromEntries(columns.map((c, i) => [c, r.cells[i] ?? ""])), crowds: new Set<string>(), parts: new Set<string>(), links: list((r.detail?.links ?? []).map((l) => `${l.label}: ${l.url}`), "\n"), from: (r.detail?.item && fromCell(where, { id: r.detail.item, name: r.detail.title, agent })) || cap(pageFrom) };
      g.rows.set(key, had);
      const text = r.cells.join(" ").toLowerCase();
      // Which crowd's tab and which section it sat in, unless the row already says so.
      if (crowd && !text.includes(crowd.toLowerCase())) had.crowds.add(crowd);
      if (part && !text.includes(part.toLowerCase())) had.parts.add(part);
    }
  };
  const block = (b: Block, sec: Section, crowd: string | undefined) => {
    const c = crowd ?? "All crowds";
    const part = titleOf(sec.title);
    switch (b.type) {
      case "table":
        return grid(sec, b.label, b.columns, b.rows, crowd);
      case "calendar":
        if (b.list) return grid(sec, b.label, b.list.columns, b.list.rows, crowd);
        return grid(sec, b.label, ["Event", "Date", "City", "Note"], b.items.map((i) => ({ cells: [i.name, i.date, i.city, i.note ?? ""] })), crowd);
      case "facts":
        return b.rows.forEach((r) => say(c, part, r.label, r.value));
      case "names":
        return b.groups.forEach((g) => g.names.forEach((n) => say(c, part, list([b.label, g.label], ": "), n.name, n.note, n.item)));
      case "lines":
        return b.lines.forEach((l) => say(c, part, l.tag ?? b.label, l.text, l.reason ?? (l.from?.length ? `From ${l.from.join(", ")}` : undefined)));
      case "steps":
        return b.steps.forEach((s) => say(c, part, undefined, s.text, s.signal));
      case "checks":
        return b.checks.forEach((k) => say(c, part, b.label, k.text, k.detail));
      case "swatches":
        return b.swatches.forEach((s) => say(c, part, b.label, `${s.name} (${s.hex})`, s.from.length ? `From ${s.from.join(", ")}` : undefined));
      case "images":
        return b.images.forEach((i) => say(c, part, b.label, i.name)); // the picture's address is an image server's, not the founder's
      case "budget":
        return b.rows.forEach((r) => say(c, part, b.label, r.label, list([`${r.share}% of the budget`, r.note], ": ")));
      case "note":
        return say(c, part, undefined, b.text);
      default:
        return; // the maps, the graph of paths and the live boards are views of what's already here
    }
  };
  for (const tab of page.tabs) {
    pageFrom = where.page(tab.sources) || where.agent(agent) || "";
    for (const sec of tab.sections) for (const b of sec.blocks) block(b, sec, tab.crowd.name);
  }
  pageFrom = where.page(page.across?.sources ?? []) || where.agent(agent) || "";
  for (const sec of page.across?.sections ?? []) for (const b of sec.blocks) block(b, sec, undefined);

  // A table whose every row is in another with the same columns (the events for several crowds, inside the calendar's
  // list) is left to that one; of two that hold the same rows, the first stays.
  const all = [...grids.values()];
  const same = (a: Grid, b: Grid) => a.cols.length === b.cols.length && a.cols.every((c) => b.cols.includes(c));
  const within = (g: Grid, o: Grid) => [...g.rows.keys()].every((k) => o.rows.has(k));
  const kept = all.filter((g, i) => !all.some((o, j) => o !== g && same(g, o) && within(g, o) && (o.rows.size > g.rows.size || j < i)));

  const out: { sheet: Sheet; about: string }[] = [];
  for (const g of kept) {
    const rows = [...g.rows.values()].map((r): Cell[] => [...g.cols.map((c) => r.cells[c]), [...r.crowds].join(", "), [...r.parts].join(", "), r.links, r.from]);
    const sheet = table(tabName(who, g.title), [...g.cols, "For crowds", "Page section", "Links", "Where it came from"], rows);
    if (sheet) out.push({ sheet, about: `From the ${who}'s page: ${g.title}.` });
  }
  const more = table(tabName(who, "Findings"), ["Crowd", "Section", "Group", "What", "Why", "Where it came from"], found);
  if (more) out.push({ sheet: more, about: `Everything else the ${who} found: names, words and notes, by crowd.` });
  return out;
}

function results(team: TeamState): Sheet | undefined {
  const rows = [...(team.outcomes ?? [])].sort((a, b) => b.at - a.at).map((o): Cell[] => [day(o.at), o.name, kindOf(o), nameOf(o.agent), markLabel(o.mark, o.agent), "Your mark in Execute Plan"]);
  return table("Results", ["Date", "Name", "Type", "Subagent", "What happened", "Where it came from"], rows);
}

function sales(team: TeamState): Sheet | undefined {
  const s = team.sales;
  if (!s?.orders.length) return undefined;
  return table(s.sample ? "Sales by place (sample)" : "Sales by place", ["Place", "Orders", "Revenue ($)", "Where it came from"], salesByPlace(s).map((p) => [p.name, p.orders, p.revenue, s.sample ? "The sample orders file" : "Your orders file"]));
}

function leftOut(plan: ExecPlan, where: Where): Sheet | undefined {
  return table("Left out", ["Name", "Type", "Subagent", "Why it was left out", "Where it came from"], plan.leftOut.map((l) => [l.name, kindOf(l), nameOf(l.agent), l.why, fromCell(where, l)]));
}

/** The workbook's tabs, About first. `now` dates it and sets which follow-ups are due. */
export function planSheets(saved: { brief?: BrandBrief; journey?: Journey }, now = Date.now()): Sheet[] {
  const { brief, journey } = saved;
  const team = journey?.team ?? emptyTeam();
  const plan = execPlan(team);
  const live = plan.items.filter((it) => !it.left).sort(inOrder);
  const reach = live.filter((it) => it.outreach);
  const where = whereFor(saved);

  const tabs: { sheet?: Sheet; about: string }[] = [
    { sheet: outreach(team, reach, now, where), about: "Every shop, partner, creator, podcast and event to reach, in Athena's order, with the contact found and where each stands." },
    { sheet: drafts(team, reach, where), about: "The email, DM and call script for each one, to copy. Athena never sends them." },
    { sheet: planSheet(team, plan, where), about: "Athena's growth plan, step by step." },
    { sheet: tasks(team, live.filter((it) => !it.outreach), where), about: "The rest of Execute Plan: the steps that aren't outreach." },
    { sheet: crowds(journey, where), about: "Your crowds, strongest first: people whose tastes overlap, each named after two things they love, with what they share as Athena's read." },
    ...PAGES.flatMap((a) => { const p = team.works[a]?.page; return p ? pageSheets(a, p, where) : []; }),
    { sheet: results(team), about: "What happened: each mark made in Execute Plan, newest first." },
    { sheet: sales(team), about: "Orders from the sales file, by place." },
    { sheet: leftOut(plan, where), about: "What the brand-fit check left out, and why." },
  ];
  const sheets = tabs.filter((t): t is { sheet: Sheet; about: string } => !!t.sheet);
  const names = sheetNames(["About", ...sheets.map((t) => t.sheet.name)]);
  sheets.forEach((t, i) => (t.sheet.name = names[i + 1]));

  const name = brief?.name?.value ?? "The brand";
  const about: Cell[][] = [[`${name}: Athena's growth plan`, `Written ${new Date(now).toISOString().slice(0, 10)}`]];
  const add = (label: string, value?: string) => value && about.push([label, value]);
  add("Sells", brief?.sells?.value);
  add("Home city", brief?.activeCity?.value);
  add("Price tier", brief?.tierHint?.value && cap(brief.tierHint.value));
  add("Stage", brief?.stageHint?.value && (brief.stageHint.value === "prelaunch" ? "Not launched yet" : cap(brief.stageHint.value)));
  for (const f of briefFacts(brief, (journey?.facts ?? []).map((f) => f.text))) add("About the brand", f);
  for (const a of team.answered ?? []) add(a.question, a.answer);
  add("Athena's plan", team.plan?.headline);
  for (const q of team.plan?.open ?? []) add("Still open", q);
  add("What already sells", salesLine(team.sales));
  about.push([], ["Tabs in this file"]);
  for (const t of sheets) about.push([t.sheet.name, t.about]);
  return [{ name: names[0], rows: about }, ...sheets.map((t) => t.sheet)];
}

/** The workbook's bytes. */
export const planWorkbook = (saved: { brief?: BrandBrief; journey?: Journey }, now = Date.now()) => xlsx(planSheets(saved, now));
