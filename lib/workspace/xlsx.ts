import { strToU8, zipSync } from "fflate";

// A small Excel workbook writer (.xlsx), for the plan spreadsheet the founder downloads. Pure and client-safe: the
// browser builds the file from its own journey. Each sheet's first row is its header, bold and frozen; text wraps;
// a day is a real date the sheet can sort. Inline strings only, so there is no shared-strings table to keep.

/** A cell: text, a number, a day (YYYY-MM-DD), or empty. */
export type Cell = string | number | { day: string } | null | undefined;
export type Sheet = { name: string; rows: Cell[][] };

/** Excel's own limits: a sheet name's length and characters, and a cell's length. */
const NAME_MAX = 31;
const CELL_MAX = 32767;

const esc = (s: string) =>
  s
    // Characters XML 1.0 can't carry, and lone surrogates: dropped, so the file always opens.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const col = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : col(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

/** A day as Excel's serial number: days since 30 Dec 1899. */
const serial = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000 + 25_569;

/** Sheet names as Excel takes them: no []:*?/\, at most 31 characters, none twice (case aside). */
export function sheetNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    const base = raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Sheet";
    for (let n = 1; ; n++) {
      const tail = n === 1 ? "" : ` ${n}`;
      const name = base.slice(0, NAME_MAX - tail.length).trimEnd() + tail;
      if (!seen.has(name.toLowerCase())) return seen.add(name.toLowerCase()), name;
    }
  });
}

/** Column widths from what they hold: wide enough for a short value, capped so long text wraps. */
function widths(rows: Cell[][]): number[] {
  const w: number[] = [];
  for (const row of rows)
    row.forEach((c, i) => {
      const s = c == null ? "" : typeof c === "object" ? "2026-12-31" : String(c);
      const longest = Math.max(...s.split("\n").map((l) => l.length));
      w[i] = Math.max(w[i] ?? 8, Math.min(longest + 2, 60));
    });
  return w;
}

function sheetXml(rows: Cell[][]): string {
  const out: string[] = [];
  rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((c, i) => {
      if (c == null || c === "") return;
      const ref = `${col(i)}${r + 1}`;
      const s = r === 0 ? 1 : 2;
      if (typeof c === "number" && Number.isFinite(c)) cells.push(`<c r="${ref}" s="${s}"><v>${c}</v></c>`);
      else if (typeof c === "object" && /^\d{4}-\d{2}-\d{2}$/.test(c.day)) cells.push(`<c r="${ref}" s="3"><v>${serial(c.day)}</v></c>`);
      else {
        const t = esc(String(typeof c === "object" ? c.day : c).slice(0, CELL_MAX));
        if (t) cells.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`);
      }
    });
    if (cells.length) out.push(`<row r="${r + 1}">${cells.join("")}</row>`);
  });
  const cols = widths(rows).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${out.join("")}</sheetData>` +
    `</worksheet>`
  );
}

// 0: default; 1: the header, bold; 2: text, wrapped and top-aligned; 3: a day, as a date.
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** The workbook's bytes: one tab per sheet, in order. */
export function xlsx(sheets: Sheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: "Sheet", rows: [] }];
  const names = sheetNames(list.map((s) => s.name));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<bookViews><workbookView/></bookViews>` +
        `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  list.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows))));
  return zipSync(files, { level: 6 });
}
