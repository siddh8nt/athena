import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyJourney } from "@/lib/journey/types";
import { emptyTeam, type TeamState } from "@/lib/team/types";
import { mintLink } from "@/lib/workspace/links";
import { saveSnapshot } from "@/lib/workspace/server";
import { sharedPlan } from "@/lib/workspace/share";
import { ExecutivePlan } from "@/components/Executive";
import { ShareView } from "@/components/ShareView";
import { GET as mcpGet } from "@/app/mcp/[secret]/route";
import { GET as calGet } from "@/app/cal/[secret]/route";

// §23.6 k: Share with your team. A share link is its own scope: it opens the view-only Execute Plan and nothing else
// (never the MCP server, never the calendar feed), New link revokes the old one, and the page has no editing controls.
// Offline: the plan comes from the gitignored recorded run where it exists, so that part skips where it isn't.

const ws = () => `test-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
const brief = { name: { value: "Fishwife", source: { kind: "message" } }, websites: [], stockists: [], comparables: [], competitors: [], notes: [] };
const withPlan = (): TeamState => ({ ...emptyTeam(), plan: { headline: "Win the Mystery readers first", steps: [] } as unknown as TeamState["plan"] });

const SNAPSHOTS = path.join(".cache", "dev", "snapshots");
function recorded(): TeamState | undefined {
  if (!fs.existsSync(SNAPSHOTS)) return undefined;
  for (const f of fs.readdirSync(SNAPSHOTS).filter((f) => f.endsWith(".json")).sort().reverse()) {
    const raw = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS, f), "utf8")).store?.["athena:journey:v1"];
    const t = raw ? (JSON.parse(raw).journey?.team as TeamState | undefined) : undefined;
    if (t?.plan?.steps?.length && t.works.rep?.page) return t;
  }
  return undefined;
}

describe("share with your team (§23.6 k)", () => {
  it("opens the plan from the mirrored workspace, without the undo copy", async () => {
    const id = ws();
    await saveSnapshot(id, { brief, journey: { ...emptyJourney(), inputs: { input_budget: "$500" }, team: { ...withPlan(), previous: {} } } });
    const { secret } = (await mintLink(id, "share"))!;
    const s = await sharedPlan(secret);
    expect(s.kind).toBe("plan");
    if (s.kind !== "plan") return;
    expect(s.brand).toBe("Fishwife");
    expect(s.budget).toBe("$500");
    expect(s.team.plan?.headline).toBe("Win the Mystery readers first");
    expect("previous" in s.team).toBe(false);
  });

  it("says the plan is coming when none is written yet", async () => {
    const id = ws();
    await saveSnapshot(id, { brief, journey: { ...emptyJourney(), team: emptyTeam() } });
    const { secret } = (await mintLink(id, "share"))!;
    expect(await sharedPlan(secret)).toEqual({ kind: "waiting", brand: "Fishwife" });
  });

  it("New link revokes the old one", async () => {
    const id = ws();
    await saveSnapshot(id, { brief, journey: { ...emptyJourney(), team: withPlan() } });
    const a = (await mintLink(id, "share"))!;
    const b = (await mintLink(id, "share"))!;
    expect((await sharedPlan(a.secret)).kind).toBe("replaced");
    expect((await sharedPlan(b.secret)).kind).toBe("plan");
  });

  it("opens only with a share link (or the demo's), never the founder's connect link", async () => {
    const id = ws();
    await saveSnapshot(id, { brief, journey: { ...emptyJourney(), team: withPlan() } });
    const full = (await mintLink(id, "full"))!;
    const cal = (await mintLink(id, "cal"))!;
    expect((await sharedPlan(full.secret)).kind).toBe("replaced");
    expect((await sharedPlan(cal.secret)).kind).toBe("replaced");
  });

  it("a share link never opens the MCP server or the calendar feed", async () => {
    const id = ws();
    await saveSnapshot(id, { brief, journey: { ...emptyJourney(), team: withPlan() } });
    const { secret } = (await mintLink(id, "share"))!;
    const params = Promise.resolve({ secret });
    expect((await mcpGet(new Request(`https://app.test/mcp/${secret}`), { params })).status).toBe(404);
    const ics = await (await calGet(new Request(`https://app.test/cal/${secret}.ics`), { params: Promise.resolve({ secret: `${secret}.ics` }) })).text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  const team = recorded();
  it.skipIf(!team)("the view-only page has no editing controls", () => {
    const own = renderToStaticMarkup(
      createElement(ExecutivePlan, { team: team!, live: { status: {}, lines: {}, replies: {}, asks: [], answers: {}, asked: {}, running: 0, held: {}, blocking: {} }, brand: "Fishwife", running: false, onStart() {}, onOpened() {}, onStartAnyway() {}, onAsk() {}, onOpen() {}, onUpdatePlan() {}, onRewritePlan() {}, onBringBack() {} }),
    );
    const shared = renderToStaticMarkup(createElement(ShareView, { team: team!, brand: "Fishwife" }));
    expect(shared).toContain(team!.plan!.headline);
    for (const control of ["Update the plan", ">Start<", "Start anyway", "Bring it back", "Tell Athena", "tell Athena"]) expect(shared).not.toContain(control);
    // The founder's own page still has what the shared one drops.
    expect(/Update the plan|>Start<|Start anyway|Bring it back|Tell Athena|tell Athena/.test(own)).toBe(true);
  });
});
