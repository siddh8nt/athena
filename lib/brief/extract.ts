import { unzipSync, strFromU8 } from "fflate";
import { parseCsv, tableToStockists, toCsv, type Table } from "./rows";
import type { Stockist } from "./types";

// One route per file type (§9.22), so Gemini only sees formats it reads natively (PDF, text, PNG/JPEG/WebP).
// Office files are unzipped in memory and their XML read with regexes; macros and embedded objects are ignored.

export type FileKind = "pdf" | "png" | "jpeg" | "webp" | "xlsx" | "pptx" | "docx" | "text" | "unknown";

export const UPLOAD_LIMITS = { files: 10, fileBytes: 15 * 1024 * 1024, totalBytes: 40 * 1024 * 1024, sheetRows: 2000, deckImages: 10 } as const;

/** Type from the bytes, never the name (§14.5). */
export function sniff(b: Uint8Array): FileKind {
  const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (at(0, "%PDF")) return "pdf";
  if (b[0] === 0x89 && at(1, "PNG")) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp";
  if (at(0, "PK")) {
    const names: string[] = [];
    try {
      // List entry names only; the filter declines every file, so nothing is decompressed.
      unzipSync(b, { filter: (f) => (names.push(f.name), false) });
    } catch {
      return "unknown";
    }
    if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
    if (names.some((n) => n.startsWith("ppt/"))) return "pptx";
    if (names.some((n) => n.startsWith("word/"))) return "docx";
    return "unknown";
  }
  // Text: valid UTF-8 with no NUL bytes in the first 4 KB.
  const head = b.subarray(0, 4096);
  if (head.includes(0)) return "unknown";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length < b.length ? b.subarray(0, 4096 - 4) : head);
    return "text";
  } catch {
    return "unknown";
  }
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");

/** Text of every `<tag>…</tag>` run in a paragraph-ish block. */
const runs = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))].map((m) => decodeXml(m[1])).join("");

function unzip(b: Uint8Array, want: (name: string) => boolean): Record<string, string> {
  const files = unzipSync(b, { filter: (f) => want(f.name) && f.originalSize < 30 * 1024 * 1024 });
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

const colIndex = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? "A")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const byNumber = (a: string, b: string) => +(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - +(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);

/** XLSX → one table per sheet (≤ 2,000 rows each). */
export function readXlsx(b: Uint8Array): { sheet: string; table: Table }[] {
  const x = unzip(b, (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = [...(x["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1], "t"));
  const names = [...(x["xl/workbook.xml"] ?? "").matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decodeXml(m[1]));
  return Object.keys(x)
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort(byNumber)
    .map((n, i) => {
      const table: Table = [];
      for (const row of x[n].matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = c[1];
          const body = c[2] ?? "";
          const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
          const type = /\bt="(\w+)"/.exec(attrs)?.[1];
          const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
          const value = type === "s" ? shared[+(v ?? -1)] ?? "" : type === "inlineStr" ? runs(body, "t") : decodeXml(v ?? "");
          cells[ref ? colIndex(ref) : cells.length] = value.trim();
        }
        if (cells.some(Boolean)) table.push(Array.from(cells, (c) => c ?? ""));
        if (table.length >= UPLOAD_LIMITS.sheetRows) break;
      }
      return { sheet: names[i] ?? `Sheet ${i + 1}`, table };
    })
    .filter((s) => s.table.length);
}

/** PPTX → slide text and speaker notes in slide order, plus embedded images (≤ 10, larger first). */
export function readPptx(b: Uint8Array): { slides: { n: number; text: string; notes: string }[]; images: { mime: string; data: Uint8Array }[] } {
  const x = unzip(b, (n) => /^ppt\/(slides|notesSlides)\/\w+?\d+\.xml$/.test(n));
  const para = (xml: string) => [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => runs(m[1], "a:t").trim()).filter(Boolean).join("\n");
  const slides = Object.keys(x)
    .filter((n) => n.startsWith("ppt/slides/"))
    .sort(byNumber)
    .map((n) => {
      const num = +(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);
      const notes = x[`ppt/notesSlides/notesSlide${num}.xml`];
      return { n: num, text: para(x[n]), notes: notes ? para(notes).replace(/^\d+$/m, "").trim() : "" };
    });
  const media = unzipSync(b, { filter: (f) => /^ppt\/media\/.+\.(png|jpe?g|webp)$/i.test(f.name) && f.originalSize > 8 * 1024 && f.originalSize < 5 * 1024 * 1024 });
  const images = Object.entries(media)
    .sort((p, q) => q[1].length - p[1].length)
    .slice(0, UPLOAD_LIMITS.deckImages)
    .map(([name, data]) => ({ mime: /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg", data }));
  return { slides, images };
}

/** DOCX → paragraph text and tables. */
export function readDocx(b: Uint8Array): { text: string; tables: Table[] } {
  const xml = unzip(b, (n) => n === "word/document.xml")["word/document.xml"] ?? "";
  const tables: Table[] = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((t) =>
    [...t[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => runs(c[1], "w:t").trim())),
  );
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, "");
  const text = [...body.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((m) => runs(m[1], "w:t").trim()).filter(Boolean).join("\n");
  return { text, tables };
}

/** What one file contributes: text for Gemini, native parts for Gemini, and stockist rows parsed in code. */
export type Extracted = {
  name: string;
  kind: FileKind;
  text: string;
  parts: { mime: string; data: Uint8Array }[];
  stockists: Stockist[];
  status: string; // the chip line: "Read 12 slides", "Found 38 stockists"
};

export function extractFile(name: string, b: Uint8Array): Extracted {
  const kind = sniff(b);
  const base = { name, kind, text: "", parts: [] as Extracted["parts"], stockists: [] as Stockist[] };
  const tablesOut = (tables: { label: string; table: Table }[]) => {
    const texts: string[] = [];
    const stockists: Stockist[] = [];
    for (const { label, table } of tables) {
      const rows = tableToStockists(table);
      if (rows) stockists.push(...rows);
      // Stockist tables go in as rows, not text, so the model never paraphrases them; other tables go as CSV.
      else texts.push(`${label}:\n${toCsv(table.slice(0, 200))}`);
    }
    return { texts, stockists };
  };
  switch (kind) {
    case "pdf":
      return { ...base, parts: [{ mime: "application/pdf", data: b }], status: "Reading the PDF" };
    case "png":
    case "jpeg":
    case "webp":
      return { ...base, parts: [{ mime: `image/${kind}`, data: b }], status: "Reading the image" };
    case "text": {
      const raw = new TextDecoder().decode(b).slice(0, 200_000);
      const t = /\.(csv|tsv)$/i.test(name) || /^[^\n]*[,\t][^\n]*\n/.test(raw) ? tablesOut([{ label: name, table: parseCsv(raw) }]) : undefined;
      if (t?.stockists.length) return { ...base, text: t.texts.join("\n\n"), stockists: t.stockists, status: `Found ${t.stockists.length} stockists` };
      return { ...base, text: raw.slice(0, 60_000), status: "Read the text" };
    }
    case "xlsx": {
      const sheets = readXlsx(b);
      const t = tablesOut(sheets.map((s) => ({ label: `Sheet "${s.sheet}"`, table: s.table })));
      return { ...base, text: t.texts.join("\n\n"), stockists: t.stockists, status: t.stockists.length ? `Found ${t.stockists.length} stockists` : `Read ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}` };
    }
    case "pptx": {
      const { slides, images } = readPptx(b);
      const text = slides.map((s) => `Slide ${s.n}:\n${s.text}${s.notes ? `\nSpeaker notes: ${s.notes}` : ""}`).join("\n\n");
      return { ...base, text, parts: images, status: `Read ${slides.length} slide${slides.length === 1 ? "" : "s"}` };
    }
    case "docx": {
      const { text, tables } = readDocx(b);
      const t = tablesOut(tables.map((table, i) => ({ label: `Table ${i + 1}`, table })));
      return { ...base, text: [text, ...t.texts].join("\n\n"), stockists: t.stockists, status: t.stockists.length ? `Found ${t.stockists.length} stockists` : "Read the document" };
    }
    default:
      return { ...base, status: "Not a kind of file Athena reads yet; describe it in your message instead" };
  }
}
