import type { Block, CrowdPage, Section } from "@/lib/team/page";

// The duplicate check for §23.5 (p): each thing is listed in full in one place. A view is one crowd tab, the Across
// overview, or one city's own page; inside a view no item may show twice, outside the named shortlists, which name
// items listed elsewhere on purpose, and the pipelines, which track them.

export const SHORTLISTS = ["One pitch, several crowds", "Doors you can afford", "Events for several crowds", "One ask, several crowds", "Works for all three"];

const norm = (s: string) =>
  s
    .replace(/^\d+\.\s+/, "")
    .replace(/\s*\(\d+\)$/, "")
    .trim()
    .toLowerCase();

/** "New York: strong here" names New York; a line with no lead-in names itself. */
const lead = (s: string) => (/^[^:]{2,60}: /.test(s) ? s.slice(0, s.indexOf(": ")) : s);

/** A fact's value read as the names it lists ("New York, Orlando and Washington DC"). */
const listed = (v: string) => v.split(/,\s+|\s+and\s+/).map((x) => x.trim()).filter((x) => x.length > 1);

const shortlist = (s: Section, b: Block) => SHORTLISTS.includes(s.title) || ("label" in b && !!b.label && SHORTLISTS.includes(b.label));

/** A neighbourhood is its own thing, even where it shares its city's name (Houston, in Houston). */
const HOOD = "neighbourhood · ";

/** The items a block lists, by name. Pictures, maps, graphs, boards and the budget list nothing. */
export function itemsOf(b: Block): string[] {
  switch (b.type) {
    case "facts":
      return b.rows.flatMap((r) => (r.label.includes(": ") ? [lead(r.label)] : listed(r.value).map((x) => (/neighbourhood/i.test(r.label) ? HOOD + x : x))));
    case "names":
      return b.groups.flatMap((g) => g.names.map((n) => (n.kind === "neighbourhood" ? HOOD : "") + n.name));
    case "lines":
      return b.lines.map((l) => lead(l.text));
    case "table":
      return b.rows.map((r) => (b.columns[0] === "Neighbourhood" ? HOOD : "") + r.cells[0]);
    case "calendar": {
      // A tour's stops in other cities or on other dates are dated things of their own; the same stop twice is not.
      const stops = new Set<string>();
      const names = new Set<string>();
      return b.items.flatMap((i) => {
        const stop = [i.name, i.city ?? "", i.date ?? ""].join("|");
        if (stops.has(stop)) return [i.name];
        stops.add(stop);
        if (names.has(i.name)) return [];
        names.add(i.name);
        return [i.name];
      });
    }
    case "checks":
      return b.checks.map((c) => c.text);
    default:
      return [];
  }
}

export type View = { name: string; sections: Section[] };

/** The views a founder sees: each crowd tab, the Across overview, and each city's own page. */
export function viewsOf(label: string, page: CrowdPage): View[] {
  const across = page.across?.sections ?? [];
  return [
    ...page.tabs.map((t) => ({ name: `${label} · ${t.crowd.name}`, sections: t.sections })),
    { name: `${label} · Across`, sections: across.filter((s) => !s.id.startsWith("city:")) },
    ...across.filter((s) => s.id.startsWith("city:")).map((s) => ({ name: `${label} · ${s.title}`, sections: [s] })),
  ];
}

/** Every item a view lists twice, as "view: item (where, where)". */
export function duplicates(label: string, page: CrowdPage): string[] {
  const out: string[] = [];
  for (const v of viewsOf(label, page)) {
    const where = new Map<string, string[]>();
    for (const s of v.sections)
      for (const b of s.blocks) {
        if (shortlist(s, b)) continue;
        for (const it of itemsOf(b)) {
          const k = norm(it);
          if (k) where.set(k, [...(where.get(k) ?? []), `${s.title}${"label" in b && b.label ? ` › ${b.label}` : ""}`]);
        }
      }
    for (const [k, at] of where) if (at.length > 1) out.push(`${v.name}: ${k} (${at.join(", ")})`);
  }
  // A thing listed in full on a city's page is not listed again in a table on the Across overview.
  const across = page.across?.sections ?? [];
  const inCity = new Set(across.filter((s) => s.id.startsWith("city:")).flatMap((s) => s.blocks.filter((b) => b.type === "table").flatMap(itemsOf).map(norm)));
  for (const s of across.filter((x) => !x.id.startsWith("city:")))
    for (const b of s.blocks) if (b.type === "table" && !shortlist(s, b)) for (const it of itemsOf(b)) if (inCity.has(norm(it))) out.push(`${label} · Across: ${norm(it)} (${s.title}, and a city's page)`);
  return out;
}
