import "server-only";
import { getStore } from "@/lib/store";
import { domainOf, generateStream } from "@/lib/llm/vertex";
import type { Metro } from "@/lib/playbook/metros";
import type { DateLookup } from "@/lib/blocks/moments";
import { today as runToday } from "@/lib/time/now";
import { safeUrl } from "@/lib/agent/intake";
import { byOpened, readPages } from "./pages";

// Festival dates (§9.18). Tested 8 Oct on Brightland's LA festivals:
//   - Search alone: correct answers, but grounding sources came back on only 2 of 6, and never for bare JSON.
//   - Search + URL context, gemini-3.1-pro-preview, thinking LOW: sources on every answer, 12–56 s.
//     (3.8 Flash took 77–108 s for the same grounded question; Flash-Lite was fast but missed dates.)
// Rule: the model names the page and quotes the date as written; the page's domain must be one of the
// grounding sources, and the quoted text must parse to a full date in the next 12 months. Never guessed.
// Streaming thought summaries ("Searching event dates…") narrate the wait. A lookup never throws and
// never runs past its time limit; an unconfirmed festival is simply left out of Moments.
// Demo brands are looked up ahead of time by the warm-cache job, so judges never wait (§14.9).
// Google's terms require showing the Search Suggestions chip with grounded results: kept as searchEntryPoint.

const DAY = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 60_000;
const DAILY_CAP = 150; // grounded calls a day (§14.5); Gemini 3 bills each search query it generates
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

type Found = Awaited<ReturnType<DateLookup>>;
type Entry = { at: number; value: Found };
// Stored in the shared store (Firestore in production), so warmed dates survive restarts.

const NS = "festival-dates";

/** Parses the first full date in text written the way pages write it ("OCT 25 2026", "Saturday, October 17, 2026", "Dec 13 - Dec 14, 2026", "2026-10-17"). */
export function parseLooseDate(text: string, today: string): string | undefined {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  const pad = (n: number) => String(n).padStart(2, "0");
  let y: number | undefined, mo: number | undefined, d: number | undefined;
  if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else {
    const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text);
    if (!m) return undefined;
    mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    d = Number(m[2]);
    const year = /\b(20\d{2})\b/.exec(text.slice(m.index));
    y = year ? Number(year[1]) : undefined;
    if (y === undefined) {
      // No year written: the next occurrence of that month and day.
      y = new Date(today).getUTCFullYear();
      if (`${y}-${pad(mo)}-${pad(d)}` < today) y++;
    }
  }
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  const delta = new Date(date).getTime() - new Date(today).getTime();
  return delta >= 0 && delta <= 366 * DAY ? date : undefined;
}

/** Reads the model's "DATE: … | URL: …" line and checks it against the grounding sources, or the pages that opened. */
export function verifyAnswer(text: string, sourceTitles: (string | undefined)[], today: string, opened: string[] = []): { date: string; url: string; site: string } | undefined {
  const line = /DATE:\s*(.+?)\s*\|\s*URL:\s*(\S+)/i.exec(text);
  if (!line) return undefined;
  const date = parseLooseDate(line[1], today);
  const url = line[2].replace(/[).,]+$/, "");
  const site = domainOf(url);
  if (!date || !site) return undefined;
  const grounded = sourceTitles.map((t) => (t ?? "").toLowerCase().replace(/^www\./, ""));
  if (byOpened(opened)(url)) return { date, url, site };
  return grounded.some((g) => g && (site === g || site.endsWith(`.${g}`) || g.endsWith(`.${site}`))) ? { date, url, site } : undefined;
}

/** When the search cited nothing, the page its answer named is opened: the date stands only if that page states it. */
async function readNamed(text: string, festival: string, today: string) {
  const url = safeUrl(/URL:\s*(\S+)/i.exec(text)?.[1]?.replace(/[).,]+$/, "") ?? "");
  if (!url) return undefined;
  try {
    const { j, opened } = await readPages<{ date?: string | null }>([url], `The next date of the "${festival}" event this page states, after ${today}. Reply: {"date": the date exactly as the page writes it, else null}.`);
    return typeof j?.date === "string" ? verifyAnswer(`DATE: ${j.date} | URL: ${url}`, [], today, opened) : undefined;
  } catch {
    return undefined;
  }
}

let usedToday = { day: "", count: 0 };

/**
 * `attempts` > 1 is for the warm-cache job, where nobody waits: a festival that can't be confirmed is retried,
 * and recent misses are re-checked instead of skipped. Live lookups use one attempt.
 */
export function groundedFestivalDates(enabled: boolean, opts: { attempts?: number } = {}): DateLookup | undefined {
  if (!enabled) return undefined;
  const attempts = Math.max(1, opts.attempts ?? 1);
  const warm = attempts > 1;
  return async (festival, metro: Metro, onThought) => {
    const none: Found = { date: null, url: null };
    // Which dates count as future follows the run date; the daily lookup cap follows the real day.
    const today = runToday();
    const realDay = new Date().toISOString().slice(0, 10);
    const key = `${festival}|${metro.id}`;
    const hit = (await getStore().get<Found>(NS, key)) as Entry | undefined;
    // A confirmed date stays valid until it passes (refreshed daily by the warm job); misses retry after an hour.
    if (hit?.value.date && hit.value.date >= today && Date.now() - hit.at < 7 * DAY) return hit.value;
    if (!warm && hit && !hit.value.date && Date.now() - hit.at < DAY / 24) return none;
    if (usedToday.day !== realDay) usedToday = { day: realDay, count: 0 };
    if (usedToday.count >= DAILY_CAP) return none;
    usedToday.count++;

    let value: Found = none;
    for (let a = 0; a < attempts && !value.date; a++) {
      if (a > 0) {
        if (usedToday.count >= DAILY_CAP) break;
        usedToday.count++;
      }
      const res = await generateStream(
        {
          model: "pro",
          grounding: true,
          urlContext: true,
          thinking: "LOW",
          temperature: 1.0, // Google's recommended setting for grounded answers
          maxOutputTokens: 8192, // thinking counts against this; 1,024 risked cut-off answers (9 Oct)
          timeoutMs: LOOKUP_TIMEOUT_MS,
          prompt:
            `Today is ${today}. Find the next date of the "${festival}" event in or near ${metro.name}, USA, within the next 12 months. ` +
            `Open the page that states it. Reply in one line: DATE: <date exactly as the page writes it> | URL: <that page's URL>. ` +
            `If no page states a future date, reply: No date found.`,
        },
        (title) => onThought?.(title),
      );
      const ok = res.complete ? (verifyAnswer(res.text, res.sources.map((s) => s.title ?? domainOf(s.uri)), today, res.retrievedUrls) ?? (await readNamed(res.text, festival, today))) : undefined;
      if (ok) value = { date: ok.date, url: ok.url, site: ok.site, searchEntryPoint: res.searchEntryPoint };
    }
    // Don't overwrite a still-valid date with a miss from a flaky lookup.
    if (value.date || !(hit?.value.date && hit.value.date >= today)) await getStore().set(NS, key, value);
    return value.date ? value : hit?.value.date && hit.value.date >= today ? hit.value : none;
  };
}
