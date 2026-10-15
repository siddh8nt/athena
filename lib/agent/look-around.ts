import "server-only";
import type { QlooClient } from "@/lib/qloo/client";
import type { Env } from "@/lib/env";
import type { AgentEvent } from "@/lib/blocks/types";
import { domainOf } from "@/lib/llm/vertex";
import { toolByName, TOOLS, type ToolCtx, type ToolResult } from "./tools";
import type { OnboardInput } from "./onboard";

// Independent work at once (PRD §23.2 step 7.2f, §23.4 item 5 method 2): as soon as the brand's name is known, the
// Qloo lookup and a web search run alongside the reading, with the agent's own tools. Their results reach the agent
// as given sources, so it starts with them instead of spending turns on them.

const QLOO_MS = 12_000;
const WEB_MS = 28_000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

type Emit = (e: Omit<AgentEvent, "t">) => void;

async function within(run: Promise<ToolResult>, ms: number): Promise<ToolResult | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const out = await Promise.race([run.catch(() => undefined), new Promise<undefined>((res) => (timer = setTimeout(() => res(undefined), ms)))]);
  clearTimeout(timer);
  return out;
}

export async function lookAround(name: string, site: string | undefined, deps: { qloo: QlooClient; env: Env }, emit: Emit): Promise<NonNullable<OnboardInput["lookups"]>> {
  const tools = toolByName(TOOLS);
  const ctx = (): ToolCtx => ({ qloo: deps.qloo, env: deps.env, state: { probes: [], asks: 0 }, sources: new Map(), status: () => {}, ask: () => {} });
  const host = site ? domainOf(site) : undefined;

  const inQloo = async () => {
    const why = "Looking you up in Qloo";
    const args = { query: name, type: "brand" };
    emit({ tool: "qloo_search", why, status: "running", callIds: [], summary: "" });
    const r = await within(tools.get("qloo_search")!.run(args, ctx()), QLOO_MS);
    const found = Array.isArray(r?.data) ? (r!.data as { id: string; name: string }[]) : [];
    const same = found.find((e) => norm(e.name) === norm(name));
    const line = same ? `Looked you up in Qloo: found ${same.name}` : found.length ? `Looked you up in Qloo: ${found.length} brands by close names, for me to check` : `Qloo doesn't know ${name} yet; I'll start from brands like yours`;
    emit({ tool: "qloo_search", why, status: found.length ? "ok" : "thin", callIds: [], summary: r?.summary ?? "", line, found: found.map((e) => e.name), source: { label: "Qloo" } });
    return r && found.length ? [{ tool: "qloo_search" as const, summary: r.summary, data: r.data, args }] : [];
  };

  const onWeb = async () => {
    const why = `Searching the web for ${name}`;
    const args = { query: `${name}${host ? ` (${host})` : ""}: what it sells, where it's sold, its stockists and press` };
    emit({ tool: "web_search", why, status: "running", callIds: [], summary: "" });
    const r = await within(tools.get("web_search")!.run(args, ctx()), WEB_MS);
    const data = r?.data as { answer?: string; sources?: { title?: string; uri?: string }[] } | undefined;
    const sources = data?.sources ?? [];
    if (!r || !data?.answer) {
      emit({ tool: "web_search", why, status: "thin", callIds: [], summary: "", line: `Searched the web for ${name}: nothing past what you gave me` });
      return [];
    }
    const first = sources[0]?.uri;
    emit({
      tool: "web_search",
      why,
      status: "ok",
      callIds: [],
      summary: r.summary,
      line: `Searched the web for ${name}: ${sources.length ? `${sources.length} page${sources.length === 1 ? "" : "s"} about you` : "a short answer"}`,
      found: [data.answer.replace(/\s+/g, " ").slice(0, 400)],
      source: first ? { label: sources[0].title || domainOf(first) || first, url: first } : undefined,
    });
    return [{ tool: "web_search" as const, summary: r.summary, data: r.data, args }];
  };

  return (await Promise.all([inQloo(), onWeb()])).flat();
}
