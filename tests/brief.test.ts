import { describe, expect, it } from "vitest";
import { emptyBrief, mergeBrief, missingRequired, ready, type BrandBrief } from "@/lib/brief/types";
import { parseCsv, tableToStockists } from "@/lib/brief/rows";

const msg = { kind: "message" as const };

describe("checklist (§6.2.1, v3.0)", () => {
  it("the conversation needs only the name and the product; city and channel never block it", () => {
    expect(missingRequired(emptyBrief())).toEqual(["name", "sells"]);
  });

  it("researched and guessed values count; the founder corrects them in words, not taps", () => {
    const b: BrandBrief = {
      ...emptyBrief(),
      name: { value: "Liquid Death", source: msg },
    };
    expect(missingRequired(b)).toEqual(["sells"]);
    expect(ready({ ...b, sells: { value: "canned water", source: { kind: "web", ref: "liquiddeath.com" } } })).toBe(true);
  });

  it("empty values count as missing", () => {
    const b = { ...emptyBrief(), name: { value: "  ", source: msg }, sells: { value: "", source: msg } };
    expect(missingRequired(b)).toEqual(["name", "sells"]);
  });

  it("keeps the channel guess and the product traits through a merge", () => {
    const { brief } = mergeBrief(emptyBrief(), { channel: { value: "online", source: { kind: "inferred" } }, traits: ["tinned fish", "premium"] });
    expect(brief.channel?.value).toBe("online");
    expect(mergeBrief(brief, { traits: [] }).brief.traits).toEqual(["tinned fish", "premium"]);
  });
});

describe("mergeBrief (§9.22)", () => {
  it("typed beats file beats guess, and reports real conflicts", () => {
    const a = { ...emptyBrief(), tierHint: { value: "premium" as const, source: { kind: "file" as const, ref: "deck.pptx" } } };
    const { brief, conflicts } = mergeBrief(a, { tierHint: { value: "mainstream", source: msg } });
    expect(brief.tierHint?.value).toBe("mainstream");
    expect(conflicts).toHaveLength(1);
    const g = mergeBrief(brief, { tierHint: { value: "luxury", source: { kind: "agent_guess" } } });
    expect(g.brief.tierHint?.value).toBe("mainstream");
  });

  it("dedupes stockists by name and city", () => {
    const s = (name: string, city?: string) => ({ value: { name, city }, source: msg });
    const { brief } = mergeBrief({ ...emptyBrief(), stockists: [s("Erewhon", "LA")] }, { stockists: [s("erewhon", "la"), s("Erewhon", "NYC")] });
    expect(brief.stockists).toHaveLength(2);
  });
});

describe("stockist tables in code", () => {
  it("parses quoted CSV and maps columns", () => {
    const t = parseCsv('Store Name,Address,City,State\n"Joe\'s, Market","1 Main St",Austin,TX\nBlue Bottle,2 Elm,Oakland,CA\n');
    expect(tableToStockists(t)).toEqual([
      { name: "Joe's, Market", address: "1 Main St", city: "Austin, TX" },
      { name: "Blue Bottle", address: "2 Elm", city: "Oakland, CA" },
    ]);
  });

  it("ignores tables that aren't stockist lists", () => {
    expect(tableToStockists(parseCsv("Month,Revenue\nJan,100"))).toBeUndefined();
  });
});

import { strToU8, zipSync } from "fflate";
import { extractFile, sniff } from "@/lib/brief/extract";

describe("file routes (§9.22)", () => {
  it("sniffs from bytes, not names", () => {
    expect(sniff(strToU8("%PDF-1.7 ..."))).toBe("pdf");
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("png");
    expect(sniff(strToU8("hello, world"))).toBe("text");
  });

  it("reads an XLSX stockist sheet into rows in code", () => {
    const xlsx = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Stockists" sheetId="1"/></sheets></workbook>'),
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Name</t></si><si><t>City</t></si><si><t>Erewhon</t></si><si><t>Los Angeles</t></si><si><t>Joe &amp; Co</t></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="inlineStr"><is><t>Austin</t></is></c></row></sheetData></worksheet>',
      ),
    });
    const x = extractFile("whatever.bin", xlsx);
    expect(x.kind).toBe("xlsx");
    expect(x.stockists).toEqual([
      { name: "Erewhon", address: undefined, city: "Los Angeles" },
      { name: "Joe & Co", address: undefined, city: "Austin" },
    ]);
  });

  it("reads PPTX slides and notes in order", () => {
    const slide = (t: string) => strToU8(`<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`);
    const pptx = zipSync({
      "ppt/presentation.xml": strToU8("<p/>"),
      "ppt/slides/slide10.xml": slide("Ten"),
      "ppt/slides/slide2.xml": slide("Two"),
      "ppt/notesSlides/notesSlide2.xml": slide("Premium tier"),
    });
    const x = extractFile("deck.pptx", pptx);
    expect(x.text).toBe("Slide 2:\nTwo\nSpeaker notes: Premium tier\n\nSlide 10:\nTen");
  });

  it("reads DOCX paragraphs and stockist tables", () => {
    const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const docx = zipSync({
      "word/document.xml": strToU8(
        `<w:document><w:body><w:p><w:r><w:t>We sell oat milk.</w:t></w:r></w:p><w:tbl><w:tr>${cell("Store")}${cell("City")}</w:tr><w:tr>${cell("Whole Foods")}${cell("Boston")}</w:tr></w:tbl></w:body></w:document>`,
      ),
    });
    const x = extractFile("brief.docx", docx);
    expect(x.text.trim()).toBe("We sell oat milk.");
    expect(x.stockists).toEqual([{ name: "Whole Foods", address: undefined, city: "Boston" }]);
  });
});

import { isRepeat } from "@/lib/brief/conversation";
import { briefToInput } from "@/lib/brief/to-input";

describe("conversation guardrails (§6.2.1)", () => {
  it("spots a rephrased repeat question, and lets a new one through", () => {
    const asked = ["Where do people buy it today: in shops and cafés, online, or somewhere else?"];
    expect(isRepeat("So where do people mostly buy it today: shops, cafés or online?", asked)).toBe(true);
    expect(isRepeat("Which US city are you focused on first?", asked)).toBe(false);
  });

  it("maps the brief to the plan's input, stockists as rows", () => {
    const input = briefToInput({
      ...emptyBrief(),
      name: { value: "Graza", source: msg },
      activeCity: { value: "none yet", source: msg },
      stockists: [{ value: { name: "Erewhon", city: "LA" }, source: { kind: "file", ref: "s.csv" } }],
    });
    expect(input.city).toBeUndefined();
    expect(input.rows).toEqual([{ name: "Erewhon", city: "LA" }]);
  });
});

describe("where a fact came from", () => {
  it("names a web source by its site, never a search's redirect link", async () => {
    const { sourceLabel } = await import("@/lib/brief/source");
    expect(sourceLabel({ kind: "web", ref: "forbes.com" })).toBe("from the web · forbes.com");
    expect(sourceLabel({ kind: "web", ref: "https://www.forbes.com/sites/x" })).toBe("from the web · forbes.com");
    // 15 Oct, live: grounding links are redirects that ran past the Brand panel's edge.
    expect(sourceLabel({ kind: "web", ref: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ" })).toBe("from the web");
  });
});
