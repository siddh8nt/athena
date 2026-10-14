import { UPLOAD_LIMITS, extractFile, type Extracted } from "@/lib/brief/extract";
import { emptyBrief, mergeBrief, type BrandBrief } from "@/lib/brief/types";

// Reading what the browser sends: the brief it holds and the files it uploads. Shared by the brief and onboarding
// routes. Files are read in memory and never stored (§14.5).

export /** The client's copy of the brief, re-capped by merging it into an empty one. */
function readBrief(raw: string | null): BrandBrief {
  let b: Partial<BrandBrief> = {};
  try {
    b = raw ? (JSON.parse(raw) as Partial<BrandBrief>) : {};
  } catch {
    b = {};
  }
  const { brief } = mergeBrief(emptyBrief(), b);
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const r = b.research;
  return {
    ...brief,
    qloo: b.qloo,
    proxies: Array.isArray(b.proxies) ? b.proxies.filter((x) => typeof x === "string").slice(0, 5) : undefined,
    retail: ["food", "beauty", "home", "fashion", "general"].includes(b.retail as string) ? b.retail : undefined,
    traits: Array.isArray(b.traits) ? b.traits.filter((x) => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 6) : undefined,
    channel: b.channel && ["online", "offline", "both"].includes(b.channel.value) ? b.channel : undefined,
    research: r && typeof r.for === "string" ? { for: str(r.for, 120), dossier: str(r.dossier, 6000), sources: (r.sources ?? []).slice(0, 8), queries: (r.queries ?? []).slice(0, 6) } : undefined,
    asked: (Array.isArray(b.asked) ? b.asked : []).map((a) => str(a, 300)).filter(Boolean).slice(-8),
    researched: Math.max(0, Number(b.researched) || 0),
    turns: Math.max(0, Number(b.turns) || 0),
    calls: Math.max(0, Number(b.calls) || 0),
  };
}

export async function readFiles(form: FormData): Promise<Extracted[]> {
  const uploads = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f).slice(0, UPLOAD_LIMITS.files);
  const files: Extracted[] = [];
  let total = 0;
  for (const f of uploads) {
    if (f.size > UPLOAD_LIMITS.fileBytes || total + f.size > UPLOAD_LIMITS.totalBytes) {
      files.push({ name: f.name, kind: "unknown", text: "", parts: [], stockists: [], status: "Over 15 MB; a smaller export (PDF or CSV) works best" });
      continue;
    }
    total += f.size;
    try {
      files.push(extractFile(f.name.slice(0, 120), new Uint8Array(await f.arrayBuffer())));
    } catch {
      files.push({ name: f.name, kind: "unknown", text: "", parts: [], stockists: [], status: "Athena reads this best as a PDF or CSV export" });
    }
  }
  return files;
}
