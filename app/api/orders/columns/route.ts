import { generate, llmConfigured, parseJson } from "@/lib/llm/vertex";
import { LIMITS, clientIp } from "@/lib/limits";
import { dated } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Is this file an orders export, and which columns hold each order's date, total, ZIP and number (PRD §23.6 i)? One
// small Flash call that sees only the header row, never a value from the file, so no customer's details reach it. The
// model reads the header as a person would; there are no column-name rules. Any failure answers "not orders", and the
// file goes to the knowledge reader like any other.

const NOT = { orders: false } as const;

export const POST = dated(async function post(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const header = (Array.isArray(b.header) ? b.header : []).slice(0, 120).map((h) => (typeof h === "string" ? h.slice(0, 80).trim() : ""));
  const file = typeof b.file === "string" ? b.file.slice(0, 160) : "";
  if (header.filter(Boolean).length < 3 || !llmConfigured() || !LIMITS.upload(clientIp(req)).ok) return Response.json(NOT);
  try {
    const res = await generate({
      model: "flash",
      json: true,
      thinking: "LOW",
      temperature: 0,
      maxOutputTokens: 400,
      budgetMs: 20_000,
      system: "You read the header row of a spreadsheet a brand's founder added to their files, to tell what the file is. Reply with JSON only.",
      prompt:
        `File: ${file || "a CSV file"}\nColumns:\n${header.map((h, i) => `[${i}] ${h || "(blank)"}`).join("\n")}\n\n` +
        "Is this an export of the brand's own customer orders from its online store (Shopify, Squarespace, WooCommerce, Etsy and the like), one row per order or per item of an order? " +
        "A stockist list, a product catalogue, inventory, a wholesale price sheet or a payout report is not.\n" +
        "If it is, give the column of: when the order was placed; the order's total paid; the shipping ZIP or postal code (the billing one only if there's no shipping one); and the order's own number or name, which the rows of one order share (null if there's none).\n" +
        'Return {"orders":boolean,"date":number|null,"total":number|null,"zip":number|null,"id":number|null}',
    });
    const r = (parseJson(res.text) ?? {}) as Record<string, unknown>;
    const col = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < header.length ? (v as number) : undefined);
    const [date, total, zip, id] = [col(r.date), col(r.total), col(r.zip), col(r.id)];
    if (r.orders !== true || date === undefined || total === undefined || zip === undefined) return Response.json(NOT);
    return Response.json({ orders: true, cols: { date, total, zip, ...(id !== undefined ? { id } : {}) } });
  } catch (err) {
    console.error("orders columns failed", err);
    return Response.json(NOT);
  }
});
