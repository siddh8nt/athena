// Grounding validator (§9.10). Every LLM sentence that reaches the UI lists its claims; each claim must
// name something in this run's evidence, and a proper-noun scan rejects capitalised names that aren't
// on the run's whitelist. Banned phrasings (claims about customers as people, §15) are rejected too.

export type Claim = { kind: "brand" | "theme" | "tag" | "reference" | "interest" | "venue" | "partner"; ref: string };
export type Sentence = { text: string; claims?: Claim[] };
export type Violation = { text: string; reason: string };

const lc = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim();
const BANNED = [/\byour (customers|buyers|shoppers|audience) (are|is|love|want)\b/i, /\bpredicts?\b/i, /\bguaranteed?\b/i, /\bwill stock\b/i, /\blikely to buy\b/i];
// Capitalised words that start sentences or are common English, never treated as names.
const COMMON = new Set(["a", "an", "the", "for", "and", "or", "but", "with", "your", "you", "our", "we", "this", "that", "these", "those", "every", "each", "when", "where", "why", "how", "what", "who", "meet", "make", "bring", "turn", "find", "taste", "try", "share", "pour", "drizzle", "cook", "host", "join", "people", "fans", "new", "now", "from", "in", "on", "at", "to", "of", "it", "its", "is", "are", "be", "like", "love", "loves", "because", "if", "so", "not", "no", "yes", "one", "two", "three", "here", "there", "all", "more", "less", "real", "good", "great", "little", "big", "small", "first", "best", "kitchen", "table", "dinner", "lunch", "breakfast", "weekend", "morning", "night", "today", "tonight", "i", "my", "me", "let", "let's", "post", "video", "reel", "series", "story", "stories", "behind", "inside", "how-to", "recipe", "recipes", "pair", "pairing", "pairs", "ideas", "idea", "tips", "guide",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december", "spring", "summer", "fall", "autumn", "winter", "holiday", "holidays", "instagram", "tiktok", "reels", "hi", "hello", "hey", "dear", "best", "thanks", "thank", "cheers", "team", "could", "would"]);

/** Names in a sentence: runs of Capitalised words not at sentence start and not common words. */
export function properNouns(text: string): string[] {
  const out: string[] = [];
  const words = text.replace(/[“”"]/g, " ").split(/\s+/);
  let run: string[] = [];
  const flush = () => {
    if (run.length) out.push(run.join(" "));
    run = [];
  };
  words.forEach((raw, i) => {
    const w = raw.replace(/^[^\p{L}\d]+|[^\p{L}\d'&]+$/gu, "");
    const prevEnds = i === 0 || /[.!?:]$/.test(words[i - 1] ?? "");
    // A sentence's first word is capitalised anyway, so it never starts a name on its own ("Crowds like yours…").
    if (prevEnds && run.length === 0) flush();
    else if (w && /^\p{Lu}/u.test(w) && (!COMMON.has(lc(w)) || run.length > 0 || /^\p{Lu}/u.test(words[i + 1] ?? ""))) run.push(w);
    else flush();
    if (/[.!?,;:]$/.test(raw)) flush();
  });
  flush();
  return out;
}

export function validate(sentences: Sentence[], allowed: Partial<Record<Claim["kind"], string[]>>, extraNames: string[] = []): { ok: Sentence[]; violations: Violation[] } {
  const sets = Object.fromEntries(Object.entries(allowed).map(([k, v]) => [k, new Set((v ?? []).map(lc))])) as Partial<Record<Claim["kind"], Set<string>>>;
  const whitelist = new Set([...Object.values(allowed).flatMap((v) => v ?? []), ...extraNames].map(lc));
  const ok: Sentence[] = [];
  const violations: Violation[] = [];
  for (const s of sentences) {
    if (!s?.text) continue;
    const banned = BANNED.find((b) => b.test(s.text));
    if (banned) {
      violations.push({ text: s.text, reason: "describes customers as people or makes a banned claim" });
      continue;
    }
    const badClaim = (s.claims ?? []).find((c) => !sets[c.kind]?.has(lc(c.ref)));
    if (badClaim) {
      violations.push({ text: s.text, reason: `"${badClaim.ref}" is not in the evidence as a ${badClaim.kind}` });
      continue;
    }
    // Any name in the text must be in the evidence (whole name, or a part of a whitelisted name).
    const stray = properNouns(s.text).find((n) => ![...whitelist].some((w) => w === lc(n) || w.includes(lc(n)) || lc(n).includes(w)));
    if (stray) {
      violations.push({ text: s.text, reason: `"${stray}" is not in the evidence` });
      continue;
    }
    if (/\d/.test(s.text)) {
      violations.push({ text: s.text, reason: "contains a number that isn't in the evidence" });
      continue;
    }
    ok.push(s);
  }
  return { ok, violations };
}
