import { describe, expect, it } from "vitest";
import { emptyJourney } from "@/lib/journey/types";
import { emptyTeam } from "@/lib/team/types";
import { splitBytes } from "@/lib/store";
import { DEMO_LINK, DEMO_SECRET, DEMO_WS, compactSaved, reserved } from "@/lib/workspace/demo";
import { mintLink, resolveLink } from "@/lib/workspace/links";
import { handleMcp } from "@/lib/workspace/mcp";
import { saveSnapshot } from "@/lib/workspace/server";

// §23.6 e, the judges' demo link: one fixed read-only link to a seeded workspace no browser can overwrite, and a
// store that can hold a long journey in Firestore (split across documents) so the seeded demo fits at all.

describe("splitBytes (Firestore's 1 MiB per document)", () => {
  it("keeps a small value whole", () => {
    expect(splitBytes("hello", 100)).toEqual(["hello"]);
  });

  it("splits into pieces under the byte cap that join back exactly, never halving an emoji", () => {
    const s = "tinned fish 🐟 é ".repeat(5000);
    const parts = splitBytes(s, 1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(s);
    for (const p of parts) {
      expect(Buffer.byteLength(p)).toBeLessThanOrEqual(1000);
      expect(Buffer.from(p, "utf8").toString("utf8")).toBe(p); // no lone surrogate at either edge
    }
  });
});

describe("the judges' demo link (§23.6 e)", () => {
  it("resolves the fixed secret to the demo workspace, read only", async () => {
    expect(await resolveLink(DEMO_SECRET)).toEqual(DEMO_LINK);
    expect(DEMO_LINK).toMatchObject({ ws: DEMO_WS, scope: "read" });
  });

  it("reserves demo ids: no browser can mint a link for one", async () => {
    expect(reserved(DEMO_WS)).toBe(true);
    expect(reserved(crypto.randomUUID())).toBe(false);
    expect(await mintLink(DEMO_WS, "full")).toBeUndefined();
  });

  it("seeds only what the MCP server reads: no chat, no undo copy", () => {
    const saved = { brief: { name: { value: "Fishwife" } }, msgs: [{ text: "hi" }], turn: { n: 1 }, journey: { ...emptyJourney(), team: { ...emptyTeam(), previous: { big: true } } } };
    const out = compactSaved(saved) as { brief: unknown; journey: { team: Record<string, unknown> } };
    expect(Object.keys(out)).toEqual(["brief", "journey"]);
    expect(out.journey.team).not.toHaveProperty("previous");
    expect(out.journey.team).toHaveProperty("works");
    expect(compactSaved({ brief: {} })).toBeUndefined();
  });

  it("refuses ask_athena on a read-only link, so the demo never spends", async () => {
    const ws = `test-${Math.random().toString(36).slice(2, 10)}`;
    await saveSnapshot(ws, { brief: { name: { value: "Fishwife", source: { kind: "message" } } }, journey: { ...emptyJourney(), team: emptyTeam() } });
    const { secret } = (await mintLink(ws, "read"))!;
    const meta = (await resolveLink(secret))!;
    const req = new Request("https://app.test/mcp/x", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask_athena", arguments: { message: "What should I do next?" } } }),
    });
    const body = (await (await handleMcp(req, meta)).json()) as { result?: { isError?: boolean } };
    expect(body.result?.isError).toBe(true);
  });
});

/** Just enough of a Firestore client for FirestoreStore: collection().doc().get/set/delete, and getAll. */
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (v: Record<string, unknown>) => void docs.set(path, v),
    delete: async () => void docs.delete(path),
  });
  const db = {
    collection: (ns: string) => ({ doc: (id: string) => ref(`${ns}/${id}`) }),
    getAll: async (...refs: { get: () => Promise<unknown> }[]) => Promise.all(refs.map((r) => r.get())),
  };
  return { docs, db: Promise.resolve(db as never) };
}

describe("FirestoreStore with a value over one document", () => {
  it("splits it into parts, reads it back whole, and drops old parts when it's rewritten or deleted", async () => {
    const { FirestoreStore } = await import("@/lib/store");
    const { docs, db } = fakeFirestore();
    const store = new FirestoreStore("test", db);
    const big = { journey: "🐟 Fishwife ".repeat(200_000) }; // ~2.6 MB, three or more parts
    await store.set("ws-journey", DEMO_WS, big);
    expect(docs.size).toBeGreaterThan(3);
    expect((await store.get<typeof big>("ws-journey", DEMO_WS))?.value).toEqual(big);

    await store.set("ws-journey", DEMO_WS, { journey: "small now" });
    expect(docs.size).toBe(1); // the old parts are gone
    expect((await store.get("ws-journey", DEMO_WS))?.value).toEqual({ journey: "small now" });

    await store.set("ws-journey", DEMO_WS, big);
    await store.delete("ws-journey", DEMO_WS);
    expect(docs.size).toBe(0);
  });
});
