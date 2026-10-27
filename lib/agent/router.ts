import "server-only";
import { generate, parseJson } from "@/lib/llm/vertex";
import { TOOLS } from "./tools";
import { briefFacts } from "@/lib/brief/facts";
import { ATHENA, EXECUTIVE, SPECIALISTS, isSpecialist, nameOf, type AgentId, type SpecialistId } from "./specialists";
import { checkChange } from "./interpret";
import type { BrandBrief } from "@/lib/brief/types";
import { MARKS, MARK_LABEL, type Answer, type GivenContact, type Route, type TeamState, type WaitScope } from "@/lib/team/types";
import { DEFAULT_WAIT, norm, planView, profileOf, type PlanView, type Stage } from "@/lib/exec/plan";

// One router per message (PRD §23.2 step 8.5n). Every message the founder types to Athena is read once by the model,
// with what she knows about herself (built from the registry: each subagent's mission, tools and deliverables, the
// data sources, what she can't do) and what the team knows (the knowledge base, the answers, the goals, the workflow,
// the works, the open questions, the recent messages verbatim and a summary of older ones). It decides one move:
// reply, use her tools, edit the Brand Graph, hand to a subagent behind the scenes, change the workflow, or ask a
// clarifying question. This replaces the old split between the graph's reader and the team's. Code checks the move:
// a subagent must exist, a change must be one the workflow can take, a question must offer real options. With no
// model the message goes where it went before: to the subagent whose page it was typed on, or to the graph's reader.

export type Move = Route["do"];
export type { Route };

export type RouteInput = {
  message: string;
  /** The chat so far, oldest first: the last few go verbatim, the rest as a summary. */
  history: { who: string; text: string }[];
  /** The page it was typed on: a subagent's page means the founder is looking at that subagent's work. */
  page?: AgentId | "dashboard";
  brand: { name: string; sells?: string; home?: string };
  /** The Brand Knowledge Base: what the graph holds, as short facts. */
  facts: string[];
  answers: Answer[] | { question: string; answer: string }[];
  team: TeamState;
  /** Questions still waiting on the founder. */
  open: string[];
  /** Execute Plan as the page shows it (§23.5 r); without it, read from the team. */
  plan?: PlanView;
};

const DATA = [
  "Qloo's taste graph: the brand's taste fingerprint, the crowds around it, what they love, where their taste concentrates, venues and brands and podcasts they over-index on",
  "the US Census: how many people a crowd's places reach",
  "Ticketmaster: events and their dates",
  "Wikipedia page views: what is rising",
  "the web: the brand's own site, shops, press and events, read with sources",
];

const CANNOT = [
  "send emails, pitches or messages for the founder, or post anywhere: she writes the words, the founder sends them",
  "spend money, buy ads, or place orders",
  "see the brand's sales, analytics or inbox unless the founder adds them as files",
  "work outside the United States: cities and regions are US only",
  "work on several cities or every crowd at once: one city and the crowd to win first, then the next",
];

export { briefFacts };

/** What Athena knows she is and can do, from the registry: it changes when a subagent or a tool does. */
export function selfKnowledge(): string {
  const team = SPECIALISTS.map((s) => {
    const tools = TOOLS.filter((t) => t.for?.includes(s.id)).map((t) => t.name);
    return `- The ${s.name} (id "${s.id}"): ${s.mission} Delivers: ${s.delivers.join("; ")}.${tools.length ? ` Tools: ${tools.join(", ")}.` : ""}${s.needs.length ? ` ${s.needs.map((n) => `It ${n.why}, from the ${nameOf(n.from)}`).join("; ")}.` : ""}`;
  });
  return [
    `You are ${ATHENA.name}, who leads a growth team for a consumer brand's founder. ${ATHENA.mission}`,
    "Your six subagents (only you speak to the founder; they work behind you):",
    ...team,
    `- The ${EXECUTIVE.name} (id "${EXECUTIVE.id}"), who does no research: ${EXECUTIVE.mission}`,
    `Your data sources: ${DATA.join("; ")}.`,
    `You can't: ${CANNOT.join("; ")}.`,
    "You also keep the Brand Graph, what the team knows about the brand, which the founder can edit by telling you.",
  ].join("\n");
}

/** Where an item stands, in words the model reads. */
const STAGE_WORDS: Record<Stage, string> = {
  queued: "not looked up yet",
  reading: "being looked up",
  drafting: "being drafted",
  ready: "drafts ready to send",
  needs: "needs a contact",
  sent: "sent",
  waiting: "waiting on a reply",
  follow: "follow-up due",
  yes: "said yes",
  no: "said no",
};

/** Execute Plan as the page sent it, else as the team holds it (a caller with the whole team). */
const viewOf = (i: RouteInput) => i.plan ?? planView(i.team, Date.now());

/** The plan view the page sent, shape-checked and cut to size; anything malformed is left out. */
export function readPlanView(raw: unknown): PlanView | undefined {
  const v = obj(raw);
  const headline = clean(v.headline, 400);
  if (!headline) return undefined;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : undefined);
  return {
    headline,
    ...(n(v.started) ? { started: n(v.started) } : {}),
    ...(n(v.later) ? { later: n(v.later) } : {}),
    found: Math.round(n(v.found) ?? 0),
    wait: days(v.wait) ?? DEFAULT_WAIT,
    rules: (Array.isArray(v.rules) ? v.rules : []).flatMap((r) => (clean(obj(r).text, 120) && days(obj(r).days) ? [{ text: clean(obj(r).text, 120), days: days(obj(r).days)! }] : [])).slice(0, 12),
    spent: n(v.spent) ?? 0,
    items: (Array.isArray(v.items) ? v.items : [])
      .flatMap((r) => {
        const o = obj(r);
        const stage = o.stage as Stage;
        return clean(o.id, 200) && clean(o.name, 200) && typeof o.stage === "string" && Object.hasOwn(STAGE_WORDS, stage) ? [{ id: clean(o.id, 200), name: clean(o.name, 200), kind: clean(o.kind, 40), stage }] : [];
      })
      .slice(0, 400),
  };
}

/** What the team knows this turn, kept short: the model reads it with every message. */
export function teamKnowledge(i: RouteInput): string {
  const t = i.team;
  const works = Object.values(t.works).flatMap((w) =>
    w ? [`- The ${nameOf(w.agent)}: ${w.headline}${w.results.length ? ` (${w.results.slice(0, 6).map((r) => `${r.kind}: ${r.name}, because ${r.why.slice(0, 140)}`).join("; ")})` : ""}${w.handoff ? `. Waiting on: ${w.handoff.need}` : ""}`] : [],
  );
  const steps = t.workflow?.steps.map((s) => `${s.id === "athena" ? "Execute Plan" : `the ${nameOf(s.id)}`}: ${s.state}`) ?? [];
  const v = viewOf(i);
  const rules = v?.rules.map((r) => `${r.text} (${r.days} days)`) ?? [];
  const items = v?.items.slice(0, 60).map((it) => `${it.name} (${it.kind}, ${STAGE_WORDS[it.stage]})`) ?? [];
  // The rest by name only, so "emailed Amorino Gelato in Atlanta" can name any item on the plan as it's listed.
  const rest = v?.items.slice(60).map((it) => it.name) ?? [];
  const exec = v
    ? `Execute Plan: ${v.started ? "started" : v.later ? "left for later by the founder" : "not started"}; ${v.found} contact${v.found === 1 ? "" : "s"} found so far; a pitch with no reply comes up again after ${v.wait} days${rules.length ? `, except: ${rules.join("; ")}` : ""}${v.spent ? `; $${v.spent} spent so far` : ""}.` +
      (items.length ? `\nIts outreach items (name, kind, where it stands): ${items.join("; ")}` : "") +
      (rest.length ? `\nIts other outreach items, by name: ${rest.join("; ")}` : "")
    : "";
  const recent = i.history.slice(-8);
  const older = i.history.slice(0, -8).filter((m) => m.who === "you").map((m) => m.text.slice(0, 120));
  return [
    `The brand: ${i.brand.name}${i.brand.sells ? `, which sells ${i.brand.sells}` : ""}${i.brand.home ? `, based in ${i.brand.home}` : ""}.`,
    i.facts.length ? `What the Brand Graph holds:\n${i.facts.slice(0, 40).map((f) => `- ${f}`).join("\n")}` : "The Brand Graph is still thin.",
    t.goals.length ? `The founder's goals: ${t.goals.filter((g) => g.id !== "know_crowd").map((g) => g.label).join("; ") || "not picked yet"}.` : "No goals picked yet.",
    steps.length ? `The workflow: ${steps.join("; ")}.` : "No workflow yet: the founder starts it from the dashboard.",
    works.length ? `What the team has found:\n${works.join("\n")}` : "The team hasn't found anything yet.",
    v ? `Your plan so far: ${v.headline}` : "",
    exec,
    i.answers.length ? `The founder's answers:\n${i.answers.slice(-12).map((a) => `- ${a.question} ${a.answer}`).join("\n")}` : "",
    i.open.length ? `Still waiting on the founder: ${i.open.slice(0, 6).join("; ")}.` : "",
    i.page && i.page !== "athena" && i.page !== "dashboard" ? `The founder is on the ${nameOf(i.page)}'s page, looking at its work.` : i.page === "dashboard" ? "The founder is on the dashboard." : "",
    older.length ? `Earlier, the founder said (oldest first): ${older.join(" / ")}` : "",
    recent.length ? `The latest messages, verbatim:\n${recent.map((m) => `${m.who === "you" ? "Founder" : "Athena"}: ${m.text.slice(0, 400)}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** With no model, the message goes where it went before step 8.5n. */
export function codeRoute(i: Pick<RouteInput, "page" | "message">): Route {
  if (i.page && isSpecialist(i.page)) return { do: "handoff", to: i.page, task: i.message.trim().slice(0, 300), reply: `I've asked the ${nameOf(i.page)}.` };
  return { do: "graph" };
}

const MOVES: Move[] = ["reply", "tools", "graph", "handoff", "workflow", "clarify", "contacts", "followup", "outcome"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const obj = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
const words = (v: unknown) => (Array.isArray(v) ? v.map((x) => clean(x, 80)).filter(Boolean).slice(0, 8) : []);
/** Whole days, one to ninety: a wait outside that is a misreading. */
const days = (v: unknown) => {
  const d = Math.round(Number(v));
  return d >= 1 && d <= 90 ? d : undefined;
};

/** Which items the founder's words cover, as the model read them: only fields it gave, each held to what's real. */
export function readScope(v: unknown): WaitScope {
  const s = obj(v);
  const out: WaitScope = {};
  const agents = (Array.isArray(s.agents) ? s.agents : []).filter(isSpecialist).slice(0, 6);
  if (agents.length) out.agents = agents;
  for (const k of ["kinds", "groups", "crowds", "cities", "names"] as const) {
    const xs = words(s[k]).map((w) => (k === "kinds" ? w.toLowerCase() : w));
    if (xs.length) out[k] = xs;
  }
  return out;
}

/** The plan's items a name the model gave means: the ones of that name, else the one whose name holds it or is held
 *  by it ("the Museum of Sex booth"), the longest such. */
function itemsNamed(items: PlanView["items"], v: unknown): PlanView["items"] {
  const n = norm(clean(v, 120));
  if (n.length < 2) return [];
  const exact = items.filter((it) => norm(it.name) === n);
  if (exact.length) return exact.slice(0, 3);
  const near = items.filter((it) => {
    const m = norm(it.name);
    return Math.min(m.length, n.length) >= 4 && (m.includes(n) || n.includes(m));
  });
  return near.sort((a, b) => b.name.length - a.name.length).slice(0, 1);
}

/** The model's move, held to what's real. A move that doesn't check out falls back to a sensible one, never an error. */
export function checkRoute(raw: unknown, i: RouteInput): Route {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const move = MOVES.find((m) => m === r.do);
  const reply = clean(r.reply, 1600);
  if (move === "reply" && reply) return { do: "reply", reply };
  if (move === "tools") return { do: "tools", ...(reply ? { reply: reply.slice(0, 300) } : {}) };
  if (move === "graph") return { do: "graph" };
  if (move === "handoff" && isSpecialist(r.to)) {
    const to = r.to;
    return { do: "handoff", to, task: clean(r.task, 300) || i.message.slice(0, 300), reply: reply.slice(0, 300) || `I've asked the ${nameOf(to)}.` };
  }
  if (move === "workflow") {
    const c = checkChange(r.change, i.team.workflow);
    if (c.change) return { do: "workflow", change: c.change, reply: reply.slice(0, 300) || c.line || "I've changed the plan." };
    // Bringing in a subagent that's already in the plan changes nothing: what was asked is fresh work from it.
    const again = (Array.isArray((r.change as Record<string, unknown> | undefined)?.add) ? ((r.change as Record<string, unknown>).add as unknown[]) : []).find(
      (id): id is SpecialistId => isSpecialist(id) && !!i.team.workflow?.steps.some((s) => s.id === id),
    );
    if (again) return { do: "handoff", to: again, task: i.message.trim().slice(0, 300), reply: `I've asked the ${nameOf(again)} to work on it again.` };
  }
  if (move === "clarify") {
    const question = clean(r.question, 240);
    const options = (Array.isArray(r.options) ? r.options : []).map((o) => ({ label: clean(typeof o === "string" ? o : (o as Record<string, unknown>)?.label, 100) })).filter((o) => o.label).slice(0, 4);
    if (question && options.length >= 2) return { do: "clarify", question, options, ...(reply ? { reply: reply.slice(0, 300) } : {}) };
    if (question) return { do: "reply", reply: reply ? `${reply} ${question}` : question };
  }
  if (move === "contacts") {
    const s = obj(r.scope);
    const n = Math.round(Number(s.limit ?? r.limit));
    return { do: "contacts", scope: { ...readScope(s), ...(n >= 1 ? { limit: Math.min(24, n) } : {}) }, reply: reply.slice(0, 300) || "The Executive is finding those contacts, a few at a time." };
  }
  if (move === "followup") {
    const d = days(r.days);
    const rules = (Array.isArray(r.rules) ? r.rules : []).flatMap((x) => {
      const o = obj(x);
      const scope = readScope(o.scope);
      const n = days(o.days);
      const text = clean(o.text, 160);
      // A rule covers some items: one with no scope would be the default, which "days" already says.
      return n && text && Object.keys(scope).length ? [{ days: n, scope, text }] : [];
    });
    if (d || rules.length)
      return {
        do: "followup",
        ...(d ? { days: d } : {}),
        rules: rules.slice(0, 6),
        reply: reply.slice(0, 300) || (d ? `I'll bring up a pitch with no reply after ${d} day${d === 1 ? "" : "s"}.` : `Noted: ${rules.map((x) => `${x.text}, ${x.days} days`).join("; ")}.`),
      };
  }
  if (move === "outcome") {
    const plan = viewOf(i)?.items ?? [];
    const marks = (Array.isArray(r.marks) ? r.marks : [])
      .flatMap((x) => {
        const o = obj(x);
        const mark = MARKS.find((m) => m === o.mark);
        return mark ? itemsNamed(plan, o.name).map((it) => ({ item: it.id, name: it.name, mark })) : [];
      })
      .slice(0, 24);
    const spend = (Array.isArray(r.spend) ? r.spend : [])
      .flatMap((x) => {
        const o = obj(x);
        const usd = Math.round(Number(o.usd) * 100) / 100;
        return usd >= 1 && usd <= 1e6 ? itemsNamed(plan, o.name).slice(0, 1).map((it) => ({ item: it.id, name: it.name, usd })) : [];
      })
      .slice(0, 12);
    const contacts = (Array.isArray(r.contacts) ? r.contacts : [])
      .flatMap((x) => {
        const o = obj(x);
        const c = givenContact(o, i.message);
        return Object.keys(c).length ? itemsNamed(plan, o.name).slice(0, 1).map((it) => ({ item: it.id, name: it.name, ...c })) : [];
      })
      .slice(0, 6);
    const said = [
      ...marks.map((m) => `${m.name}: ${MARK_LABEL[m.mark]}`),
      ...spend.map((s) => `$${s.usd} on ${s.name}`),
      ...contacts.map((c) => `${c.name}'s ${Object.keys(c).filter((k) => k !== "item" && k !== "name").map((k) => (k === "dm" ? "profile" : k)).join(" and ")}`),
    ].join("; ");
    if (marks.length || spend.length || contacts.length)
      return { do: "outcome", marks, ...(spend.length ? { spend } : {}), ...(contacts.length ? { contacts } : {}), reply: reply.slice(0, 300) || `Noted: ${said}.` };
    // Nothing it named is on the plan: ask which, rather than move the wrong one.
    return { do: "reply", reply: "Which one on the plan was that? Tell me its name and I'll move it." };
  }
  // A move that didn't check out: a reply it wrote stands; otherwise her tools answer it.
  return reply ? { do: "reply", reply } : { do: "tools" };
}

/** The ways in the founder gave, each kept only when it's well formed and in what they wrote, so a detail the model
 *  misread or made up never lands on a row. */
export function givenContact(o: Record<string, unknown>, said: string): GivenContact {
  const text = said.toLowerCase();
  const digits = said.replace(/\D/g, "");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: GivenContact = {};
  const email = str(o.email).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) && text.includes(email)) out.email = email;
  const phone = str(o.phone);
  const pd = phone.replace(/\D/g, "");
  if (pd.length >= 7 && pd.length <= 15 && /^[\d\s()+.-]+$/.test(phone) && digits.includes(pd.replace(/^1(?=\d{10}$)/, ""))) out.phone = phone;
  // A link counts only outside an email address: "events@museumofsex.com" gives no website.
  const plain = text.replace(/[^\s@]+@[^\s@]+/g, " ");
  const link = (v: unknown) => {
    const x = str(v);
    try {
      const u = new URL(/^https?:\/\//i.test(x) ? x : `https://${x}`);
      const bare = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
      if (!/\.[a-z]{2,}$/.test(u.hostname)) return undefined;
      // A profile the founder named by its handle and site ("@papercove on Instagram") counts as given.
      const pr = profileOf(u.href);
      return plain.includes(bare) || (pr && text.includes(`@${pr.handle.toLowerCase()}`) && text.includes(pr.site.toLowerCase())) ? u.href : undefined;
    } catch {
      return undefined;
    }
  };
  const website = link(o.website);
  if (website) out.website = website;
  const dm = link(o.dm);
  if (dm) out.dm = dm;
  const address = str(o.address).slice(0, 200);
  const words = address.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (words.length >= 2 && words.filter((w) => text.includes(w)).length >= Math.ceil(words.length * 0.8)) out.address = address;
  return out;
}

/** The kinds of item on Execute Plan, as the router names them in a scope. */
const KINDS = `"venue" (bars, cafés, restaurants, galleries, places that host), "retailer" (shops, stores, stockists), "partner" (brands to team up with), "creator", "podcast", "event", "moment", "audience" (an online audience), "show", "message" (the Scout's hooks), "neighbourhood"`;

const PROMPT = `Decide your one move for the founder's latest message, and write what you say.
- "reply": you can answer from what you and the team already know: what you can do, what a subagent found and why, a follow-up on something said before, a request outside what you do (say plainly what you can't, and what you can do instead). Write the reply as natural prose, 2 to 6 sentences, explaining your reasoning and naming which subagent found what. Every fact in it comes from the brief or the team's work below, each result's own "because" for why it was picked; never add what a place serves or is known for from your own knowledge, and when the founder needs more than the team found, choose "tools" or "handoff". No lists, no headings, no internal numbers or ids. Call the six your subagents (never specialists or agents) and name the ones you mean: ${SPECIALISTS.map((x) => `the ${x.name}`).join(", ")}.
- "tools": answering needs a fresh look in the data (a lookup, a comparison, a number not already found). Say one short line in reply about what you'll look up.
- "graph": the founder is telling you something about the brand to add, change or remove in the Brand Graph (a stockist, a city, a competitor, a price, a fact).
- "handoff": the founder wants a subagent's work done again, done differently or taken further ("find more shops", "make the words more playful"). Writing something for the founder to send (a pitch, an email, an ask, a note to a shop or a partner) is always a handoff: the subagent who found the recipient writes it, checked against the evidence and with the contact it found; you never draft it yourself in a reply. Give to (its id), task (what it should do, in a sentence) and reply (one line saying who you've asked and why).
- "workflow": the founder wants the plan's steps changed: a subagent skipped or brought in, or a US city to work on. "add" is only for a subagent not in the plan yet; one already in it that should read or work again is a "handoff". Give change: {"skip"?: [ids], "add"?: [ids], "city"?: "City name"} and a one-line reply.
- "contacts": the founder wants contact details (address, website, phone, email, a DM link) found for some items on Execute Plan: "find emails for the Brooklyn shops", "get me contacts for the podcasts", "how do I reach Paper Source?". The Executive finds them a few at a time, top-ranked first, so don't ask first. Give scope with only the fields their words set, read by meaning: agents (subagent ids), kinds (${KINDS}), groups, crowds (a crowd's name), cities, names (a place, person or show they named); and limit when they say how many. Reply with one line on what the Executive will look up.
- "followup": the founder says how long to wait for a reply to a pitch before you bring it up again, for every pitch or for some: "wait two weeks", "give retailers 10 days", "podcasts take a month". Give days (whole days: two weeks is 14) for every pitch, and rules [{"days", "scope", "text"}] for some: scope as for "contacts", text the rule in a few words ("Retailers: two weeks"). Reply with one line saying what you'll do.
- "outcome": the founder tells you what happened with items on Execute Plan: they sent something ("emailed Museum of Sex", "DMed the three podcasts", "applied to the market"), heard back ("they said yes", "Paper Source passed"), got no answer, went to an event, or spent money on one ("spent $200 on the booth"); or they give a way to reach one ("Paper Cove's email is hello@papercove.com", "here's their Instagram: instagram.com/papercove"). Give marks [{"name": the item's name as the plan lists it, "mark": "pitched" (sent, applied, called) | "yes" (said yes, booked) | "no" (said no, passed) | "no_reply" | "went" (went to the event)}], spend [{"name", "usd": the amount in dollars}] and contacts [{"name", "email"?, "phone"?, "address"?, "website"?, "dm"?: a profile link}], copying each detail exactly as the founder wrote it, reading "they", "them" and "the booth" from the latest messages. Reply with one line saying what you've moved or added.
- "clarify": the message could mean two or more quite different things, and guessing wrong would waste the team's work. This includes a message that points back ("that one", "the bigger one", "do it") when more than one earlier thing fits: ask before starting a subagent on a guess. Ask one short question with 2 to 4 options, each a plain reading of what they might mean, naming the things it could refer to.
Return JSON only: {"do": "reply"|"tools"|"graph"|"handoff"|"workflow"|"clarify"|"contacts"|"followup"|"outcome", "reply"?: string, "to"?: string, "task"?: string, "change"?: {...}, "question"?: string, "options"?: [string], "scope"?: {...}, "days"?: number, "rules"?: [{...}], "marks"?: [{...}], "spend"?: [{...}], "contacts"?: [{...}]}`;

export async function routeMessage(i: RouteInput, llm: boolean, gen: typeof generate = generate): Promise<Route> {
  if (!llm || !i.message.trim()) return codeRoute(i);
  const prompt = `${teamKnowledge(i)}\n\nThe founder's latest message: "${i.message.slice(0, 600)}"\n\n${PROMPT}`;
  const read = async (model: "flash" | "lite", budgetMs: number) =>
    checkRoute(parseJson((await gen({ model, json: true, thinking: "LOW", temperature: 0.3, maxOutputTokens: 1200, budgetMs, system: selfKnowledge(), prompt })).text), i);
  try {
    return await read("flash", 20_000);
  } catch (err) {
    console.error("route failed", err);
  }
  // Flash stayed busy past its budget (a large Executive run shares its quota): the lighter model reads the message
  // once more, so "emailed Amorino Gelato" still moves that row instead of going to code's route, which can't read it.
  try {
    return await read("lite", 10_000);
  } catch (err) {
    console.error("route failed on the lighter model too", err);
    return codeRoute(i);
  }
}

/** A reply as it streams: a few words at a time, at a reading pace the client keeps. */
export function chunks(text: string): string[] {
  return text.match(/\S+\s*/g)?.reduce<string[]>((out, w, n) => (n % 3 ? ((out[out.length - 1] += w), out) : [...out, w]), []) ?? [];
}
