import { describe, expect, it } from "vitest";
import { emptyJourney } from "@/lib/journey/types";
import { emptyTeam } from "@/lib/team/types";
import { mintLink, resolveLink } from "@/lib/workspace/links";
import { handleMcp } from "@/lib/workspace/mcp";
import { saveSnapshot, readExternal } from "@/lib/workspace/server";

// §23.6 b: the MCP server runs as a stateless Next.js route — a fresh server and transport per request, no session
// held between requests (so it runs on Cloud Run's many instances). These drive the real SDK end to end, offline:
// never ask_athena, so no Gemini call. They prove the transport answers, lists Athena's tools and resources, and
// that a read-only link refuses writes while a full link's write lands where the app folds it in.

const ws = () => `test-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

/** One JSON-RPC call through a fresh stateless handler, as a real MCP client would POST it. */
async function rpc(secret: string, method: string, params: unknown = {}, id = 1) {
  const meta = await resolveLink(secret);
  if (!meta) throw new Error("link did not resolve");
  const req = new Request("https://app.test/mcp/x", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const res = await handleMcp(req, meta);
  const body = (await res.json()) as { result?: any; error?: any };
  return { status: res.status, ...body };
}

async function seed(id: string) {
  const saved = { brief: { name: { value: "Fishwife", source: { kind: "message" } }, websites: [], stockists: [], comparables: [], competitors: [], notes: [] }, journey: { ...emptyJourney(), team: emptyTeam() } };
  await saveSnapshot(id, saved);
}

describe("Athena MCP server (§23.6 b)", () => {
  it("answers initialize with its server info", async () => {
    const id = ws();
    const { secret } = (await mintLink(id, "full"))!;
    const r = await rpc(secret, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(r.result?.serverInfo?.name).toBe("Athena");
  });

  it("lists Athena's tools and resources", async () => {
    const id = ws();
    await seed(id);
    const { secret } = (await mintLink(id, "full"))!;
    const tools = (await rpc(secret, "tools/list")).result?.tools?.map((t: any) => t.name) ?? [];
    expect(tools).toEqual(expect.arrayContaining(["next_tasks", "get_draft", "mark_task", "answer_question", "add_fact", "ask_athena"]));
    const resources = (await rpc(secret, "resources/list")).result?.resources?.map((r: any) => r.uri) ?? [];
    expect(resources).toEqual(expect.arrayContaining(["athena://brief", "athena://crowds", "athena://plan", "athena://tasks", "athena://questions"]));
  });

  it("reads the brief resource from the mirrored snapshot", async () => {
    const id = ws();
    await seed(id);
    const { secret } = (await mintLink(id, "full"))!;
    const r = await rpc(secret, "resources/read", { uri: "athena://brief" });
    const brief = JSON.parse(r.result.contents[0].text);
    expect(brief.brand.name).toBe("Fishwife");
  });

  it("refuses a write on a read-only link, and never touches the external map", async () => {
    const id = ws();
    await seed(id);
    const { secret } = (await mintLink(id, "read"))!;
    const r = await rpc(secret, "tools/call", { name: "mark_task", arguments: { item: "amorino-gelato", status: "done" } });
    expect(r.result?.isError).toBe(true);
    expect(await readExternal(id)).toEqual({}); // nothing was written
  });

  it("writes a mark on a full link, where the app folds it in", async () => {
    const id = ws();
    await seed(id);
    const { secret } = (await mintLink(id, "full"))!;
    const r = await rpc(secret, "tools/call", { name: "mark_task", arguments: { item: "amorino-gelato", status: "done" } });
    expect(r.result?.isError).toBeFalsy();
    const ext = await readExternal(id);
    expect(ext.marks?.["amorino-gelato"]?.status).toBe("done");
  });

  it("adds a fact on a full link", async () => {
    const id = ws();
    await seed(id);
    const { secret } = (await mintLink(id, "full"))!;
    await rpc(secret, "tools/call", { name: "add_fact", arguments: { text: "We just launched in Whole Foods PNW" } });
    const ext = await readExternal(id);
    expect(ext.facts?.some((f) => f.text.includes("Whole Foods"))).toBe(true);
  });
});
