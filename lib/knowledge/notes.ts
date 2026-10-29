import type { LiveFact } from "./types";

// Knowledge, not raw facts (PRD §23.2 step 8.2a): everything read from the site and the files is grouped into themes
// of derived notes, each one plain statement tracing to its raw facts and their sources. The notes are the one list
// the graph, the list, the brief and the agents read; the raw facts stay behind them as sources. Pure, client-safe.

/** Themes a synthesis aims for: enough to read, few enough to scan. */
export const THEMES = { min: 5, max: 10 } as const;
/** The founder's own answers: not read from a source, so never regrouped. */
const OWN = "the founder";
/** A note no longer than `n`, cut at a word with "…" when over, never mid-word. */
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")}…`);

/** A stable id from the raw facts a note traces to, so a deletion or an edit still applies after a re-run. */
export function noteId(from: string[], salt = ""): string {
  const s = [...from].sort().join("|") + salt;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `n${(h >>> 0).toString(36)}`;
}

/** Each source as its raw facts give it: "the home page", "deck.pdf". */
export const sourcesOf = (n: Pick<LiveFact, "where">) => [...new Set(n.where.split(";").map((s) => s.trim()).filter(Boolean))];

/** A raw fact's source as a theme name, without the model: its file, or its site page. */
function sourceTheme(f: LiveFact): string {
  const w = f.where.split(";")[0].trim();
  const file = /\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|rtf|key|numbers|pages|png|jpe?g|webp|heic)$/i;
  const bare = w.split(",")[0].trim();
  if (/^https?:\/\//.test(f.source) || /^[\w-]+(\.[\w-]+)+\//.test(w) || (/^[\w-]+(\.[\w-]+)+$/.test(bare) && !file.test(bare) && !file.test(f.source))) {
    const page = w.split(",")[0];
    const path = page.replace(/^[^/]+/, "").replace(/\/$/, "");
    return path ? `Your site: ${path.split("/").filter(Boolean).at(-1)!.replace(/[-_]+/g, " ")}` : "Your site: home page";
  }
  return f.source || w || "Your sources";
}

/** Is this a derived note (rather than a raw fact or the founder's answer)? */
export const isNote = (f: LiveFact) => !!f.theme;

/**
 * Without the model (§23.2 step 8.2a): facts grouped by their source page or file, each fact its own note. Duplicate
 * wording within a source is merged.
 */
export function bySource(raw: LiveFact[]): LiveFact[] {
  const out = new Map<string, LiveFact>();
  for (const f of raw) {
    if (f.source === OWN) continue;
    const theme = sourceTheme(f);
    const k = `${theme}|${f.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    const had = out.get(k);
    if (had) {
      had.from = [...new Set([...(had.from ?? []), f.id])];
      had.where = [...new Set([...sourcesOf(had), ...sourcesOf(f)])].join("; ");
      continue;
    }
    out.set(k, { id: noteId([f.id]), text: f.text, where: f.where, source: f.source, theme, from: [f.id] });
  }
  return [...out.values()];
}

/** The themes in the order their first note comes. */
export const themesOf = (notes: LiveFact[]) => [...new Set(notes.flatMap((n) => (n.theme ? [n.theme] : [])))];

/**
 * A fresh synthesis joined to the notes as they stand (§23.2 step 8.2d): the founder's edited notes stay as they
 * left them, deleted ones stay gone, and a fresh note covering only what those already cover is left out.
 */
export function mergeNotes(current: LiveFact[], fresh: LiveFact[], gone: string[]): LiveFact[] {
  const mine = current.filter((n) => n.mine);
  const covered = new Set([...gone, ...mine.flatMap((n) => n.from ?? [])]);
  const ids = new Set(mine.map((n) => n.id));
  const kept = fresh.filter((n) => !ids.has(n.id) && !gone.includes(n.id) && (n.from ?? []).some((id) => !covered.has(id)));
  return [...mine, ...kept, ...current.filter((n) => !n.theme && n.source === OWN && !fresh.some((x) => x.id === n.id))];
}

/** Raw facts a synthesis still needs to read: not deleted by the founder, not already behind one of their notes. */
export function unread(raw: LiveFact[], current: LiveFact[], gone: string[]): LiveFact[] {
  const covered = new Set([...gone, ...current.filter((n) => n.mine).flatMap((n) => n.from ?? [])]);
  return raw.filter((f) => !covered.has(f.id) && f.source !== OWN);
}

export type SynthAsk = { about: string; note: string; options: { value: string; text: string }[] };
export type Synth = { notes: LiveFact[]; asks: SynthAsk[] };

/**
 * Reads the model's synthesis against the raw facts it was given: every note traces to known raw facts (its sources
 * are theirs), numbers are checked to appear in them, and any raw fact the model left out keeps a note of its own, so
 * nothing read goes unshown. Undefined when the reply is unusable.
 */
export function readSynth(j: unknown, raw: LiveFact[], entities: string[] = []): Synth | undefined {
  const x = (j && typeof j === "object" ? j : {}) as { themes?: unknown; asks?: unknown };
  if (!Array.isArray(x.themes) || !x.themes.length) return undefined;
  const byId = new Map(raw.map((f) => [f.id, f]));
  const names = new Map(entities.map((e) => [e.toLowerCase(), e]));
  const notes: LiveFact[] = [];
  const used = new Set<string>();
  for (const t of x.themes as unknown[]) {
    const th = (t && typeof t === "object" ? t : {}) as { name?: unknown; notes?: unknown };
    const theme = typeof th.name === "string" ? th.name.trim().slice(0, 60) : "";
    if (!theme || !Array.isArray(th.notes)) continue;
    for (const n of th.notes as unknown[]) {
      const nn = (n && typeof n === "object" ? n : {}) as { text?: unknown; facts?: unknown; about?: unknown };
      const text = typeof nn.text === "string" ? clip(nn.text.replace(/\s+/g, " ").trim(), 400) : "";
      const from = (Array.isArray(nn.facts) ? nn.facts : []).filter((id): id is string => typeof id === "string" && byId.has(id));
      if (!text || !from.length) continue;
      const src = from.map((id) => byId.get(id)!);
      // Numbers exact: a number the raw facts don't hold isn't taken; the raw facts stand on their own instead.
      const said = src.map((f) => f.text).join(" ").replace(/,/g, "");
      const nums = text.replace(/,/g, "").match(/\d+(\.\d+)?/g) ?? [];
      if (nums.some((d) => !said.includes(d))) continue;
      for (const id of from) used.add(id);
      const about = (Array.isArray(nn.about) ? nn.about : []).flatMap((a) => (typeof a === "string" && names.has(a.toLowerCase()) ? [names.get(a.toLowerCase())!] : []));
      const id = noteId(from, text.slice(0, 20));
      if (notes.some((m) => m.id === id)) continue;
      notes.push({
        id,
        text,
        where: [...new Set(src.flatMap(sourcesOf))].join("; "),
        source: src.find((f) => /\.\w{2,5}$/.test(f.source) && !/^https?:/.test(f.source))?.source ?? src[0].source,
        theme,
        from,
        ...(about.length ? { about: [...new Set(about)] } : {}),
      });
    }
  }
  if (!notes.length) return undefined;
  // What the model left out keeps a note of its own, under its source.
  const left = raw.filter((f) => !used.has(f.id) && f.source !== OWN);
  const rest = bySource(left).map((n) => ({ ...n, theme: "More from your sources" }));
  const asks = (Array.isArray(x.asks) ? x.asks : []).flatMap((a): SynthAsk[] => {
    const q = (a && typeof a === "object" ? a : {}) as { about?: unknown; facts?: unknown; options?: unknown };
    const ids = (Array.isArray(q.facts) ? q.facts : []).filter((id): id is string => typeof id === "string" && byId.has(id));
    const note = notes.find((n) => ids.some((id) => n.from?.includes(id)));
    const options = (Array.isArray(q.options) ? q.options : []).flatMap((o) => {
      const oo = (o && typeof o === "object" ? o : {}) as { value?: unknown; text?: unknown };
      return typeof oo.value === "string" && typeof oo.text === "string" && oo.value.trim() && oo.text.trim() ? [{ value: oo.value.trim().slice(0, 80), text: oo.text.trim().slice(0, 300) }] : [];
    });
    return typeof q.about === "string" && note && options.length >= 2 ? [{ about: q.about.trim().slice(0, 120), note: note.id, options: options.slice(0, 4) }] : [];
  });
  return { notes: [...notes, ...rest], asks: asks.slice(0, 3) };
}

/** The notes by theme, as the agents read them (§23.2 step 8.2e): "id | note | sources (raw ids)". */
export function byTheme(notes: LiveFact[]): { theme: string; notes: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const n of notes) {
    const theme = n.theme ?? (n.source === OWN ? "What you told me" : "Other");
    groups.set(theme, [...(groups.get(theme) ?? []), `${n.id} | ${n.text} | ${n.where}${n.from?.length ? ` (raw ${n.from.join(", ")})` : ""}`]);
  }
  return [...groups].map(([theme, ns]) => ({ theme, notes: ns }));
}
