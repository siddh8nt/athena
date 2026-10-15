import { sourceLabel } from "@/lib/brief/source";
import { NODE_TYPES, typesInOrder, type Graph, type GraphEdge, type GraphInput, type GraphNode } from "./types";

// Builds the Brand Graph (PRD §13.12) from the registry: every type's nodes and edges, less what the founder removed
// or marked wrong; a type past 12 folds into one group; and the whole stays small enough to read (about 15–25 nodes
// at the start, more as the fits and the strategies land). Deterministic and pure.

export const FOLD_AT = 12;

/** How many nodes the graph shows before it folds more types: it grows as each run adds its results. */
export const budgetFor = (input: GraphInput) => 25 + (input.fits ? 6 : 0) + (input.strategy ? 6 : 0);

/** The label a node's source shows: "from your website", "from deck.pdf, slide 4", "from Qloo", "from you". */
export const fromLabel = (n: GraphNode) => n.from ?? sourceLabel(n.source, n.confirmed);

/** Every node and edge, before folding: what the list view and the edits read. */
export function allNodes(input: GraphInput): Graph {
  const hidden = new Set(input.hidden ?? []);
  const wrong = new Set((input.brief.wrong ?? []).map((w) => w.key));
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const [, t] of typesInOrder()) {
    const g = t.from(input);
    for (const n of g.nodes) if (!nodes.has(n.id) && !hidden.has(n.id) && !wrong.has(n.key ?? n.id)) nodes.set(n.id, n);
    edges.push(...g.edges);
  }
  const seen = new Set<string>();
  return {
    nodes: [...nodes.values()],
    edges: edges.filter((e) => nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to && !seen.has(e.id) && !!seen.add(e.id)),
  };
}

/** One type's nodes as one group node; their edges point at the group, one per neighbour. */
function fold(g: Graph, type: string): Graph {
  const members = g.nodes.filter((n) => n.type === type);
  if (members.length < 2) return g;
  const t = NODE_TYPES[type];
  const id = `group:${type}`;
  const froms = [...new Set(members.map(fromLabel))];
  const group: GraphNode = {
    id,
    type,
    label: `${members.length} ${t.plural.toLowerCase()}`,
    detail: members.slice(0, 3).map((m) => m.label).join(", ") + (members.length > 3 ? "…" : ""),
    source: members[0].source,
    from: froms.length > 2 ? `${froms.slice(0, 2).join(", ")} and ${froms.length - 2} more` : froms.join(", "),
    members,
    ...(members.every((m) => m.crowd === members[0].crowd) && members[0].crowd !== undefined ? { crowd: members[0].crowd } : {}),
  };
  const inside = new Set(members.map((m) => m.id));
  const at = (x: string) => (inside.has(x) ? id : x);
  const merged = new Map<string, { e: GraphEdge; n: number }>();
  for (const e of g.edges) {
    const from = at(e.from);
    const to = at(e.to);
    if (from === to) continue;
    const k = `${e.kind}:${from}>${to}`;
    const prev = merged.get(k);
    if (prev) prev.n++;
    else merged.set(k, { e: { ...e, id: k, from, to }, n: 1 });
  }
  return {
    nodes: [...g.nodes.filter((n) => !inside.has(n.id)), group],
    edges: [...merged.values()].map(({ e, n }) => (n > 1 ? { ...e, reason: `${e.reason}, and ${n - 1} more like it` } : e)),
  };
}

/** The graph as shown: each type past 12 folded, then the most foldable types folded until it fits its budget. */
export function buildGraph(input: GraphInput): Graph {
  let g = allNodes(input);
  const count = (type: string) => g.nodes.filter((n) => n.type === type && !n.members).length;
  for (const [type, t] of typesInOrder()) if (t.fold && count(type) > FOLD_AT) g = fold(g, type);
  const budget = budgetFor(input);
  const order = typesInOrder().filter(([, t]) => t.fold).sort((a, b) => a[1].fold - b[1].fold);
  for (const [type] of order) {
    if (g.nodes.length <= budget) break;
    if (count(type) > 1) g = fold(g, type);
  }
  return g;
}

/** Groups for the list view: every type, in registry order, with all its nodes (nothing folded). */
export function listGroups(input: GraphInput) {
  const g = allNodes(input);
  return typesInOrder()
    .map(([type, t]) => ({ type, t, nodes: g.nodes.filter((n) => n.type === type) }))
    .filter((x) => x.nodes.length);
}
