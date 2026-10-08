import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Row } from "@/lib/methods/names";

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, commas inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** Independent stockists for one metro from proof/stockists/<file> (public locator data). */
export async function loadStockists(file: string, metro: string): Promise<Row[]> {
  const text = await readFile(path.join(process.cwd(), "proof", "stockists", file), "utf-8");
  return parseCsv(text)
    .filter((r) => r.metro === metro && r.is_chain !== "yes")
    .map((r) => ({ name: r.venue, address: r.address, city: r.city, lat: r.lat ? Number(r.lat) : undefined, lon: r.lon ? Number(r.lon) : undefined }));
}
