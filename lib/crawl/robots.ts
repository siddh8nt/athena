// robots.txt (RFC 9309), read before Athena fetches any page of a brand's site (PRD §23.2 step 4b). The group for
// Athena's own name wins over "*"; within a group the longest matching rule wins, and Allow wins a tie.

export const AGENT = "Athena";

export type Robots = { allowed: (path: string) => boolean; sitemaps: string[] };

type Rule = { allow: boolean; pattern: string };

const toRegex = (p: string) => new RegExp(`^${p.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$")}`);

export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: Rule[] } | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap" && value) sitemaps.push(value);
    else if ((key === "allow" || key === "disallow") && current) {
      // An empty Disallow allows everything; it adds no rule.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && AGENT.toLowerCase().includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const compiled = rules.map((r) => ({ ...r, re: toRegex(r.pattern), len: r.pattern.replace(/\*/g, "").length }));
  return {
    sitemaps,
    allowed(path: string) {
      let best: { allow: boolean; len: number } | undefined;
      for (const r of compiled) {
        if (!r.re.test(path)) continue;
        if (!best || r.len > best.len || (r.len === best.len && r.allow)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}
