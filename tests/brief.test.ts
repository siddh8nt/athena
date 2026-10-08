import { describe, expect, it } from "vitest";
import { emptyBrief, mergeBrief, missingRequired, ready, type BrandBrief } from "@/lib/brief/types";
import { parseCsv, tableToStockists } from "@/lib/brief/rows";

const msg = { kind: "message" as const };

describe("checklist (§6.2.1)", () => {
  it("blocks the start until all four facts are known", () => {
    expect(missingRequired(emptyBrief())).toEqual(["name", "sells", "howBought", "activeCity"]);
  });

  it("an unconfirmed Qloo inference still blocks; a tap on Yes or a guess unblocks", () => {
    const b: BrandBrief = {
      ...emptyBrief(),
      name: { value: "Liquid Death", source: msg },
      sells: { value: "canned water", source: { kind: "qloo" } },
      howBought: { value: ["retail"], source: { kind: "agent_guess" } },
      activeCity: { value: "Los Angeles", source: { kind: "website" }, confirmed: true },
    };
    expect(missingRequired(b)).toEqual(["sells"]);
    expect(ready({ ...b, sells: { ...b.sells!, confirmed: true } })).toBe(true);
  });

  it("empty values count as missing", () => {
    const b = { ...emptyBrief(), name: { value: "  ", source: msg }, howBought: { value: [], source: msg } };
    expect(missingRequired(b)).toContain("name");
    expect(missingRequired(b)).toContain("howBought");
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

import { applyGuesses, confirm, nextTurn, closeIfOutOfTurns } from "@/lib/brief/conversation";
import { briefToInput } from "@/lib/brief/to-input";

describe("conversation (§6.2.1)", () => {
  // F3: a brand in Qloo, given only its name and city, reaches Build my plan with ≤ 2 taps.
  it("a Qloo brand with name and city needs only one-tap confirmations", () => {
    let b: BrandBrief = {
      ...emptyBrief(),
      name: { value: "Liquid Death", source: msg },
      activeCity: { value: "Los Angeles", source: msg },
      sells: { value: "canned water", source: { kind: "qloo" } },
      howBought: { value: ["retail", "venue"], source: { kind: "qloo" } },
    };
    let taps = 0;
    for (let t = nextTurn(b); !t.ready; t = nextTurn(b)) {
      expect(t.replies.map((r) => r.id)).toContain("yes");
      b = confirm(b, t.fact!);
      taps++;
    }
    expect(taps).toBeLessThanOrEqual(2);
  });

  it("asks an open question, with a guess option, when nothing was inferred", () => {
    const t = nextTurn({ ...emptyBrief(), name: { value: "Graza", source: msg } });
    expect(t.fact).toBe("sells");
    expect(t.replies.map((r) => r.id)).toEqual(["guess"]);
  });

  it("guesses are labelled, and after the last turn every gap is guessed", () => {
    const g = applyGuesses({ ...emptyBrief(), guesses: { activeCity: "Austin" } }, ["activeCity"]);
    expect(g.activeCity).toEqual({ value: "Austin", source: { kind: "agent_guess" } });
    expect(ready(closeIfOutOfTurns({ ...emptyBrief(), turns: 5 }))).toBe(true);
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
