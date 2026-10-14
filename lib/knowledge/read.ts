import { createHash } from "node:crypto";
import { extractFile, readDocx, readPptx, readXlsxCells, rowsToTable, sniff, type FileKind, type SheetRow } from "@/lib/brief/extract";
import { parseCsv, tableToStockists } from "@/lib/brief/rows";
import type { Stockist } from "@/lib/brief/types";
import type { Where } from "./types";

// Every source in full, with locations (PRD §23.2 step 4c): PDFs and images go to Gemini as they are (it reads
// scans, charts and packaging, and says which page); slides as their text, speaker notes and pictures, each
// labelled with its slide; spreadsheets cell by cell, every non-empty cell with its address; CSVs row by row.
// Stockist tables are also read in code, so their rows are never paraphrased.

export type Part = { mime: string; data: Uint8Array; label: string };

export type Doc = {
  kind: Where["kind"];
  /** The file name, the site, or the pasted label. */
  ref: string;
  /** sha256 of the bytes (files) or of the text (pages, pasted). Extractions are stored under it. */
  hash: string;
  fileKind?: FileKind;
  /** Located text: each line starts with where it is ("[slide 4]", "[Sales!B12]", "[https://…/about]"). */
  text: string;
  parts: Part[];
  stockists: Stockist[];
  /** What the reader should know about the source as a whole, given with every piece of it. */
  note?: string;
  /** A short line for the founder: "Read 12 slides and 9 pictures". */
  status: string;
};

/** Per-file limits [VERIFY 14 Oct, Vertex docs for Gemini 2.5: 1,000 pages and 50 MB per PDF; 20 MB per inline request]. */
export const FILE_LIMITS = { bytes: 14 * 1024 * 1024, pdfPages: 1_000, deckImages: 30 } as const;

export const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** One row as cell addresses: "[Sales!12] A12=West · B12=340". */
const rowLine = (sheet: string, r: SheetRow) => `[${sheet}!${r.n}] ${r.cells.map((c) => `${c.col}${r.n}=${c.v.replace(/\s+/g, " ")}`).join(" · ")}`;

export function readFileDoc(name: string, b: Uint8Array): Doc {
  const kind = sniff(b);
  const base = { kind: "file" as const, ref: name, hash: sha256(b), fileKind: kind, text: "", parts: [] as Part[], stockists: [] as Stockist[] };
  switch (kind) {
    case "pdf":
      return { ...base, parts: [{ mime: "application/pdf", data: b, label: name }], status: `Read ${pdfPages(b) ? plural(pdfPages(b), "page") : "the PDF"}` };
    case "png":
    case "jpeg":
    case "webp":
      return { ...base, parts: [{ mime: `image/${kind}`, data: b, label: name }], status: "Read the picture" };
    case "xlsx": {
      const sheets = readXlsxCells(b);
      const stockists: Stockist[] = [];
      const lines: string[] = [];
      for (const s of sheets) {
        const rows = tableToStockists(rowsToTable(s.rows));
        if (rows) stockists.push(...rows);
        lines.push(`Sheet "${s.sheet}" (${plural(s.rows.length, "row")})${rows ? `; a stockist list of ${rows.length}, also read in code` : ""}:`, ...s.rows.map((r) => rowLine(s.sheet, r)), "");
      }
      const cells = sheets.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.cells.length, 0), 0);
      return { ...base, text: lines.join("\n").trim(), stockists, status: `Read ${plural(sheets.length, "sheet")}, ${cells.toLocaleString("en-US")} cells` };
    }
    case "pptx": {
      const { slides, images } = readPptx(b, FILE_LIMITS.deckImages);
      const text = slides.map((s) => [`[slide ${s.n}]`, s.text, s.notes ? `[slide ${s.n}, speaker notes] ${s.notes}` : ""].filter(Boolean).join("\n")).join("\n\n");
      const parts = images.map((i) => ({ mime: i.mime, data: i.data, label: i.slides.length ? `picture on slide ${i.slides.join(", ")}` : "picture in the deck" }));
      return { ...base, text, parts, status: `Read ${plural(slides.length, "slide")}${parts.length ? ` and ${plural(parts.length, "picture")}` : ""}` };
    }
    case "docx": {
      const { text, tables } = readDocx(b);
      const stockists: Stockist[] = [];
      const t = tables.map((table, i) => {
        const rows = tableToStockists(table);
        if (rows) stockists.push(...rows);
        return [`Table ${i + 1}:`, ...table.map((r, j) => `[table ${i + 1}, row ${j + 1}] ${r.join(" · ")}`)].join("\n");
      });
      const paras = text.split("\n").map((p, i) => `[paragraph ${i + 1}] ${p}`);
      return { ...base, text: [...paras, "", ...t].join("\n").trim(), stockists, status: `Read ${plural(paras.length, "paragraph")}${tables.length ? ` and ${plural(tables.length, "table")}` : ""}` };
    }
    case "text": {
      const raw = new TextDecoder().decode(b);
      if (/\.(csv|tsv)$/i.test(name) || /^[^\n]*[,\t][^\n]*\n/.test(raw)) {
        const table = parseCsv(raw);
        const stockists = tableToStockists(table) ?? [];
        return { ...base, text: table.map((r, i) => `[row ${i + 1}] ${r.join(" · ")}`).join("\n"), stockists, status: `Read ${plural(table.length, "row")}` };
      }
      return { ...base, text: raw.split("\n").map((l, i) => (l.trim() ? `[line ${i + 1}] ${l}` : "")).filter(Boolean).join("\n"), status: "Read the text" };
    }
    default:
      return { ...base, status: extractFile(name, b).status };
  }
}

/** Pages in a PDF, from its page objects (an estimate; Gemini reads the file itself). */
export function pdfPages(b: Uint8Array): number {
  const s = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");
  return (s.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export function pastedDoc(label: string, text: string): Doc {
  const lines = text.split("\n").map((l, i) => (l.trim() ? `[line ${i + 1}] ${l}` : "")).filter(Boolean);
  return { kind: "pasted", ref: label, hash: sha256(text), text: lines.join("\n"), parts: [], stockists: [], status: "Read the summary" };
}
