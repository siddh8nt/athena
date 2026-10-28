import { afterAll, describe, expect, it } from "vitest";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { REPLACED, currentLink, mintLink, resolveLink, revokeLink } from "@/lib/workspace/links";
import { POST as mcpPost } from "@/app/mcp/[secret]/route";

// §23.6 c: a connect link is an opaque secret mapped to a workspace and a scope. The store keeps only the hash, a
// new link replaces the old, and a read-only link is marked so the MCP server refuses writes.

const ws = () => `test-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
const dir = path.join(process.cwd(), ".cache", "store", "ws-link");

afterAll(async () => {
  // Best-effort: leave nothing behind, but don't fail the run if the dir is already gone.
  await rm(path.join(process.cwd(), ".cache", "store", "ws-link-cur"), { recursive: true, force: true });
});

describe("connect links (§23.6 c)", () => {
  it("mints a secret that resolves to the workspace and scope", async () => {
    const id = ws();
    const minted = await mintLink(id, "full");
    expect(minted?.secret).toBeTruthy();
    const meta = await resolveLink(minted!.secret);
    expect(meta).toMatchObject({ ws: id, scope: "full" });
  });

  it("stores only the hash, never the secret itself", async () => {
    const id = ws();
    const minted = await mintLink(id, "full", "my tool");
    const secret = minted!.secret;
    const files = await readdir(dir).catch(() => [] as string[]);
    let found = false;
    for (const f of files) {
      const raw = await readFile(path.join(dir, f), "utf-8").catch(() => "");
      expect(raw.includes(secret)).toBe(false); // the plaintext secret is never written
      if (raw.includes(id)) found = true;
    }
    expect(found).toBe(true); // the workspace mapping is there, keyed by the hash
  });

  it("does not resolve an unknown or near-miss secret", async () => {
    const id = ws();
    const minted = await mintLink(id, "full");
    expect(await resolveLink("not-a-real-secret-aaaaaaaaaaaa")).toBeUndefined();
    expect(await resolveLink(minted!.secret.slice(0, -1))).toBeUndefined(); // one char off fails
    expect(await resolveLink("")).toBeUndefined();
  });

  it("replaces the old link when a new one is minted for the same workspace and scope", async () => {
    const id = ws();
    const a = await mintLink(id, "full");
    const b = await mintLink(id, "full");
    expect(a!.secret).not.toBe(b!.secret);
    expect(await resolveLink(a!.secret)).toBeUndefined(); // the old URL stops working
    expect(await resolveLink(b!.secret)).toMatchObject({ ws: id, scope: "full" });
  });

  it("keeps a read-only link and a full link side by side", async () => {
    const id = ws();
    const full = await mintLink(id, "full");
    const read = await mintLink(id, "read");
    expect((await resolveLink(full!.secret))?.scope).toBe("full");
    expect((await resolveLink(read!.secret))?.scope).toBe("read");
  });

  it("revokes a link so its URL stops resolving", async () => {
    const id = ws();
    const minted = await mintLink(id, "full");
    await revokeLink(id, "full");
    expect(await resolveLink(minted!.secret)).toBeUndefined();
  });

  it("says whether a live link exists, so a browser that lost its secret asks before replacing it (§23.6 d)", async () => {
    const id = ws();
    expect(await currentLink(id, "share")).toBe(false);
    await mintLink(id, "share");
    expect(await currentLink(id, "share")).toBe(true);
    expect(await currentLink(id, "cal")).toBe(false);
    await revokeLink(id, "share");
    expect(await currentLink(id, "share")).toBe(false);
  });
});

describe("an old link says what happened (§23.6 c)", () => {
  const call = (secret: string) =>
    mcpPost(new Request(`http://x/mcp/${secret}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }) }), {
      params: Promise.resolve({ secret }),
    });

  it("answers a replaced link with one line on the request's own id", async () => {
    const id = ws();
    const old = await mintLink(id, "full");
    await mintLink(id, "full");
    const res = await call(old!.secret);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32001, message: REPLACED } });
  });

  it("gives a calendar or team link the same line, never the MCP server", async () => {
    const cal = await mintLink(ws(), "cal");
    expect(((await (await call(cal!.secret)).json()) as { error?: { message: string } }).error?.message).toBe(REPLACED);
  });
});
