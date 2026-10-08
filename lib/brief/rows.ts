import type { Stockist } from "./types";

// Stockist tables in code, not the LLM (§9.22 step 1): a table with a name-like column and an
// address- or city-like column becomes rows by column matching, so rows are never paraphrased.

export type Table = string[][];

/** RFC 4180-ish CSV parser: quotes, escaped quotes, commas or tabs, CRLF. */
export function parseCsv(text: string): Table {
  const delim = (text.split(/\r?\n/, 1)[0].match(/\t/g)?.length ?? 0) > (text.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delim) row.push(cell.trim()), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      (row = []), (cell = "");
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export const toCsv = (t: Table) => t.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

const NAME = /^(store|shop|venue|account|retailer|stockist|location|outlet|business|customer|cafe|caf[eé]|restaurant|bar)?\s*(name|title)?$|^(store|shop|venue|account|retailer|stockist|location|outlet|business|customer)s?$/i;
const ADDRESS = /address|street|addr\b|location address/i;
const CITY = /^(city|town|metro|market|locality)$/i;
const STATE = /^(state|province|region|st)$/i;

/** Finds the header row and the name/address/city columns, or undefined when the table isn't a stockist list. */
export function stockistColumns(table: Table): { header: number; name: number; address?: number; city?: number; state?: number } | undefined {
  for (let h = 0; h < Math.min(5, table.length); h++) {
    const cells = table[h].map((c) => c.trim());
    const name = cells.findIndex((c) => c && NAME.test(c));
    const address = cells.findIndex((c) => ADDRESS.test(c));
    const city = cells.findIndex((c) => CITY.test(c));
    const state = cells.findIndex((c) => STATE.test(c));
    if (name >= 0 && (address >= 0 || city >= 0)) {
      return { header: h, name, address: address >= 0 ? address : undefined, city: city >= 0 ? city : undefined, state: state >= 0 ? state : undefined };
    }
  }
  return undefined;
}

/** Table → stockists, or undefined when it doesn't look like one. Capped at 200 rows (§9.22). */
export function tableToStockists(table: Table): Stockist[] | undefined {
  const cols = stockistColumns(table);
  if (!cols) return undefined;
  const out: Stockist[] = [];
  for (const r of table.slice(cols.header + 1)) {
    const name = r[cols.name]?.trim();
    if (!name) continue;
    const city = cols.city !== undefined ? r[cols.city]?.trim() : undefined;
    const state = cols.state !== undefined ? r[cols.state]?.trim() : undefined;
    out.push({
      name: name.slice(0, 120),
      address: cols.address !== undefined ? r[cols.address]?.trim().slice(0, 200) || undefined : undefined,
      city: city ? (state ? `${city}, ${state}` : city).slice(0, 60) : undefined,
    });
    if (out.length >= 200) break;
  }
  return out.length ? out : undefined;
}
