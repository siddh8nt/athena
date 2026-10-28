import "server-only";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { BrandBrief } from "@/lib/brief/types";
import type { Journey } from "@/lib/journey/types";
import { emptyTeam, type TaskStatus, type TeamState } from "@/lib/team/types";
import { planView, type PlanView } from "@/lib/exec/plan";
import { briefFacts, routeMessage, type RouteInput } from "@/lib/agent/router";
import { readSnapshot, markTask, answerQuestion, addFact } from "./server";
import { type LinkMeta } from "./links";
import { reserved } from "./demo";
import { ACTIONABLE, BRAND_FILE, STAGE_NOTE, brandFile } from "./brand-file";
import { thisWeek, weekText } from "./week";

// The Athena MCP server (PRD §23.6 b). A founder's own AI tool connects through a link (links.ts) and reads the
// same brief, crowds, plan and Execute Plan the app shows, and writes back the founder's marks, answers and facts —
// which the app folds in through the merge rules (merge.ts), newest per item. One tool, ask_athena, goes through
// Athena's real router, tools and budgets (router.ts) and so spends a Gemini call; it runs on a full link only, so a
// read-only demo link (§23.6 e) never spends. The server is stateless: a fresh server and transport per request, so
// it runs as one Next.js route on Cloud Run with nothing held between requests. Everything reads the mirrored
// snapshot; if nothing has been mirrored yet, every resource and tool answers with an empty-but-valid shape, never
// an error (the no-failure-state rule).

type Saved = { brief?: BrandBrief; journey?: Journey };

/** A read of the mirrored workspace: the brief, the journey's team, and Execute Plan as the app shows it. */
type View = { brand: { name: string; sells?: string; home?: string }; facts: string[]; team: TeamState; plan?: PlanView; brief?: BrandBrief; journey?: Journey };

async function readView(ws: string): Promise<View> {
  const saved = (await readSnapshot(ws))?.saved as Saved | undefined;
  const brief = saved?.brief;
  const journey = saved?.journey;
  const team = journey?.team ?? emptyTeam();
  const notes = (journey?.facts ?? []).map((f) => f.text);
  return {
    brand: { name: brief?.name?.value ?? "your brand", sells: brief?.sells?.value, home: brief?.activeCity?.value },
    facts: briefFacts(brief, notes),
    team,
    plan: planView(team, Date.now()),
    brief,
    journey,
  };
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

/** Build the stateless MCP server for one workspace and link scope. */
export function buildServer(meta: LinkMeta): McpServer {
  const { ws, scope } = meta;
  const server = new McpServer(
    { name: "Athena", version: "1.0.0" },
    {
      instructions:
        "Athena is a growth strategist for a consumer brand. These resources are the founder's live workspace — their brand, the crowds Athena found, Athena's growth plan, and the outreach plan with where each contact stands. Read them to answer the founder about what to do next and what changed. Use mark_task, answer_question and add_fact to record what the founder tells you; use ask_athena for anything that needs Athena's own reasoning.",
    },
  );

  const readonly = scope !== "full";
  const refuse = () => ({
    ...text(
      reserved(ws)
        ? "This is Athena's read-only Fishwife tinned fish sample, so it can't make changes, and everyone who connects sees the same plan. Start your own brand in Athena for a link that can mark tasks, answer questions and add facts."
        : "This is a read-only link, so it can't make changes. Ask the founder for a full connect link to record marks, answers or facts.",
    ),
    isError: true,
  });

  // ---- Resources: the founder's workspace, read-only snapshots.

  server.registerResource("brief", "athena://brief", { title: "Brand & knowledge", description: "The brand and the facts Athena knows about it.", mimeType: "application/json" }, async () => {
    const v = await readView(ws);
    return { contents: [{ uri: "athena://brief", mimeType: "application/json", text: JSON.stringify({ brand: v.brand, knowledge: v.facts }, null, 2) }] };
  });

  server.registerResource("crowds", "athena://crowds", { title: "Crowds", description: "The audiences Athena measured, strongest first.", mimeType: "application/json" }, async () => {
    const v = await readView(ws);
    const crowds = (v.journey?.crowds?.crowds ?? []).map((c) => ({ name: c.name, main: c.main, size: c.size, loves: c.loves.slice(0, 8).map((l) => l.name), cities: c.cities.slice(0, 5).map((m) => m.name) }));
    return { contents: [{ uri: "athena://crowds", mimeType: "application/json", text: JSON.stringify(crowds, null, 2) }] };
  });

  server.registerResource("plan", "athena://plan", { title: "Growth plan", description: "Athena's growth plan: numbered steps and open questions.", mimeType: "application/json" }, async () => {
    const v = await readView(ws);
    const p = v.team.plan;
    const steps = (p?.steps ?? []).map((s) => ({ n: s.n, what: s.what, phase: s.phase, crowds: s.crowds }));
    return { contents: [{ uri: "athena://plan", mimeType: "application/json", text: JSON.stringify({ headline: p?.headline ?? "", steps, open: p?.open ?? [] }, null, 2) }] };
  });

  server.registerResource("tasks", "athena://tasks", { title: "Execute Plan", description: "The outreach plan: each contact and where it stands.", mimeType: "application/json" }, async () => {
    const v = await readView(ws);
    const items = (v.plan?.items ?? []).map((it) => ({ id: it.id, name: it.name, kind: it.kind, stage: it.stage, note: STAGE_NOTE[it.stage] }));
    return { contents: [{ uri: "athena://tasks", mimeType: "application/json", text: JSON.stringify({ headline: v.plan?.headline ?? "", found: v.plan?.found ?? 0, items }, null, 2) }] };
  });

  server.registerResource("questions", "athena://questions", { title: "Open questions", description: "What Athena is still waiting to hear from the founder.", mimeType: "application/json" }, async () => {
    const v = await readView(ws);
    return { contents: [{ uri: "athena://questions", mimeType: "application/json", text: JSON.stringify(v.team.plan?.open ?? [], null, 2) }] };
  });

  // This week (§23.6 j): the same three lists as the Overview tab and the Monday email.
  server.registerResource("this-week", "athena://this-week", { title: "This week", description: "Pitches with no reply after their wait, what falls due in the next seven days, and the next events.", mimeType: "text/plain" }, async () => {
    const v = await readView(ws);
    return { contents: [{ uri: "athena://this-week", mimeType: "text/plain", text: weekText(thisWeek({ brief: v.brief, journey: v.journey })) }] };
  });
  server.registerResource("brand-file", "athena://brand-file", { title: BRAND_FILE, description: "Everything above in one page to read first: the brand, crowds, Athena's plan in order and the open tasks.", mimeType: "text/markdown" }, async () => {
    const v = await readView(ws);
    return { contents: [{ uri: "athena://brand-file", mimeType: "text/markdown", text: brandFile({ brief: v.brief, journey: v.journey }) }] };
  });

  // ---- Tools: reads anyone may call; writes only on a full link; ask_athena spends, full link only.

  server.registerTool("next_tasks", { title: "Next tasks", description: "The outreach the founder can act on next, with where each one stands.", inputSchema: { limit: z.number().int().min(1).max(50).optional() } }, async ({ limit }) => {
    const v = await readView(ws);
    const items = (v.plan?.items ?? []).filter((it) => ACTIONABLE.includes(it.stage)).slice(0, limit ?? 12).map((it) => ({ id: it.id, name: it.name, kind: it.kind, stage: it.stage, next: STAGE_NOTE[it.stage] }));
    return json(items);
  });

  server.registerTool("get_draft", { title: "Get draft", description: "The email, DM and call script Athena wrote for one contact, by its id or name. Copy or edit, never auto-send.", inputSchema: { item: z.string().min(1) } }, async ({ item }) => {
    const v = await readView(ws);
    const rows = v.plan?.items ?? [];
    const match = rows.find((r) => r.id === item) ?? rows.find((r) => r.name.toLowerCase() === item.toLowerCase()) ?? rows.find((r) => r.name.toLowerCase().includes(item.toLowerCase()));
    const draft = match ? v.team.exec?.drafts?.[match.id] : undefined;
    if (!match) return text(`No contact matches "${item}". Read athena://tasks for the list.`);
    if (!draft) return text(`Athena hasn't drafted outreach for ${match.name} yet. In the app, open that row and choose Review draft.`);
    return json({ name: match.name, email: draft.email, dm: draft.dm, call: draft.call });
  });

  server.registerTool("mark_task", { title: "Mark task", description: "Set an outreach task's status (todo, doing, done, skipped) from the founder's own tool. The app folds it in.", inputSchema: { item: z.string().min(1), status: z.enum(["todo", "doing", "done", "skipped"]) } }, async ({ item, status }) => {
    if (readonly) return refuse();
    const v = await readView(ws);
    const rows = v.plan?.items ?? [];
    const match = rows.find((r) => r.id === item) ?? rows.find((r) => r.name.toLowerCase() === item.toLowerCase());
    const id = match?.id ?? item;
    await markTask(ws, id, status as TaskStatus);
    return text(`Marked ${match?.name ?? id} as ${status}. It will show in the app the next time it syncs.`);
  });

  server.registerTool("answer_question", { title: "Answer a question", description: "Answer one of Athena's open questions on the founder's behalf. The app reads it like a typed answer.", inputSchema: { question: z.string().min(1), answer: z.string().min(1) } }, async ({ question, answer }) => {
    if (readonly) return refuse();
    const id = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `q-${Date.now()}`;
    await answerQuestion(ws, id, "athena", question, answer);
    return text("Recorded the answer. Athena's team will read it on the next run.");
  });

  server.registerTool("add_fact", { title: "Add a fact", description: "Add a fact about the brand (a move, a new stockist, a change). The app folds it into the knowledge base.", inputSchema: { text: z.string().min(1) } }, async ({ text: fact }) => {
    if (readonly) return refuse();
    await addFact(ws, `ext-${Date.now()}`, fact);
    return text("Added to the knowledge base. It will show in the app the next time it syncs.");
  });

  server.registerTool("ask_athena", { title: "Ask Athena", description: "Ask Athena anything about this brand's growth. Goes through Athena's real reasoning, tools and budget.", inputSchema: { message: z.string().min(1) } }, async ({ message }) => {
    if (readonly)
      return {
        ...text(
          reserved(ws)
            ? "The Fishwife tinned fish sample is read-only, so it can't ask Athena to run new work. Read its resources (brief, crowds, plan, tasks) for everything Athena already found, or start your own brand in Athena to ask it anything."
            : "This is a read-only link, so it can't ask Athena (that would run Athena's tools). Ask the founder for a full connect link, or read the workspace resources for what Athena has already found.",
        ),
        isError: true,
      };
    const v = await readView(ws);
    const input: RouteInput = { message, history: [], page: "dashboard", brand: v.brand, facts: v.facts, answers: v.team.answered ?? [], team: v.team, open: v.team.plan?.open ?? [], plan: v.plan };
    const route = await routeMessage(input, true);
    return text(routeToText(route));
  });

  // ---- Prompts: the questions a founder asks most, ready to run in their tool.

  server.registerPrompt("whats_next", { title: "What should I do next?", description: "Athena's view of the next moves." }, () => ({ messages: [{ role: "user", content: { type: "text", text: "Read athena://tasks and athena://plan, then tell me the two or three things I should do next for my brand and why." } }] }));
  server.registerPrompt("since_last_week", { title: "What's changed?", description: "What's new in the plan and outreach." }, () => ({ messages: [{ role: "user", content: { type: "text", text: "Read athena://this-week, then athena://tasks for detail, and tell me what's waiting on me this week: the pitches with no reply, what's due, and the next events." } }] }));
  server.registerPrompt("prep_for_call", { title: "Prep me for a call", description: "A quick brief before reaching out to one contact.", argsSchema: { who: z.string().min(1) } }, ({ who }) => ({ messages: [{ role: "user", content: { type: "text", text: `I'm about to reach out to ${who}. Call get_draft for them and read athena://brief, then give me a two-line prep: why them, and the opening line.` } }] }));

  return server;
}

/** Athena's one move as plain text for an outside tool: every move but the graph read carries words for the founder. */
function routeToText(route: Awaited<ReturnType<typeof routeMessage>>): string {
  if (route.do === "clarify") return [route.reply, route.question, ...(route.options.length ? [`Options: ${route.options.map((o) => o.label).join(", ")}`] : [])].filter(Boolean).join("\n");
  if (route.do === "graph") return "Athena updated the brand's knowledge from this. Open the app to see the change.";
  if ("reply" in route && route.reply) return route.reply;
  return "Athena is on it — open the app to see the result.";
}

/** Handle one MCP request for a resolved link. Stateless: a fresh server and transport, used once and closed. */
export async function handleMcp(req: Request, meta: LinkMeta): Promise<Response> {
  const server = buildServer(meta);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
    await server.close();
  }
}
