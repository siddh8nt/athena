# Draft PRD change: own-brand flow (v2.13)

Status: **draft for review**, not yet applied to `ATHENA PRD.md`. Branch: `own-brand-flow`.

Sections touched: version table, §2.3 M10, §6.2, F3, new §9.22, §13.2, §14.5.

---

## Version table row

| New in v2.13 | **Try your own brand becomes a conversation, not a form** (§6.2). It opens on a brief canvas: one text box (required) plus optional files of any common kind (images, PDF, Excel/CSV, PowerPoint, Word). Athena turns everything into one structured brand brief (§9.22), shows what it understood, and asks follow-up questions until the four required facts are known. While the plan runs, it asks up to three inline questions only when the brief left a gap, never waiting: it assumes a default, keeps going, and re-runs only what an answer changes. |

---

## §2.3 M10 (replaces the row)

| M10 | **Your brand** | Clicks **Try your own brand**, describes the brand in their own words and drops in anything they have (a deck, a stockist sheet, a screenshot of a store list, a link) | Athena reads it all, shows a "What I understood" brief, and asks only for what's missing. Then the plan streams in, block by block, while Athena narrates each step and asks at most three skippable questions inline. | Any consumer company, from whatever the founder already has on hand. |

---

## §6.2 Try your own brand (M10), replaces the section

### 6.2.1 Phase 1: the brief (before any Qloo call)

1. **The canvas.** A chat-style panel, not a form. Athena's opening message: *"Tell me about your brand: what it is, what you sell, and how people buy it. Drop in anything else you have: a deck, a stockist list, a spreadsheet, screenshots, your website."*
   - **Text is required.** Everything else is optional.
   - **Attachments:** drag-and-drop, paste (including pasted screenshots) or a file picker. Accepted: images (PNG, JPEG, WebP), PDF, plain text, CSV, Excel (.xlsx), PowerPoint (.pptx), Word (.docx). URLs typed in the text are picked up as websites (§9.20).
   - Each attachment shows as a chip with a status line ("Reading 4 slides…", "Found 38 stockists") and can be removed.
2. **Ingest.** Every input becomes one **brand brief** (§9.22). Athena shows it as a "What I understood" card, each field labelled with where it came from ("from your deck, slide 3", "from stockists.xlsx", "from your message").
3. **Follow-up questions until the brief is complete.** A fixed checklist (code, not the LLM) decides what's missing. Gemini only phrases the question in the conversation's tone. Required before the plan can start:

   | Required fact | Why Athena needs it | Example question |
   |---|---|---|
   | **Brand name** | Qloo lookup, drafts | "What's the brand called?" |
   | **What it sells** (product or service, in a phrase) | Category (§7.3), comparable brands | "What exactly do you sell? A product, an app, a service?" |
   | **How customers get it** (in shops or venues, online only, through an app in cities, through partnerships) | Motions and recipe (§7.6) | "Where do people buy it today: in shops and cafés, online, or somewhere else?" |
   | **Where in the US it's active, or wants to be** (a city or "nowhere yet") | Home metro, target metro | "Which US city are you strongest in, or launching in first?" |

   - **Infer first, then confirm.** Before asking about a missing required fact, Athena tries to fill it from the Qloo brand entity (`properties.description`, `products`, `use_occasions`, tags), and from the website if one was given. If it finds a likely answer, the question becomes a one-tap confirmation: *"Looks like you sell canned water, mostly in shops and bars. Right?"* (**Yes** / **Not quite**). An open question is asked only when nothing could be inferred.
   - Questions arrive **one at a time**, each answerable in free text or a file.
   - Each question has a **"Not sure, make your best guess"** reply. Athena then fills the field itself and labels it **Agent · guessed**, shown on the brief and editable.
   - At most **4 follow-up turns.** After that, missing fields are guessed and labelled.
   - Out-of-scope businesses (§4.3) get the one-line reason and the demo cards, as today.
4. **Start.** When the checklist passes, Athena says what it will do ("I'll find you in Qloo, match your 38 stockists, and pick brands like you") and a **Build my plan** button appears. The founder can keep adding context, or start.

**Optional facts** never block the start. If missing, they are handled in Phase 2: stockists or accounts, the Qloo brand match, comparable brands, competitors (≤ 3), price tier (evidence first, §7.2), stage.

### 6.2.2 Phase 2: the run (assume, keep going, let them correct)

1. **Athena narrates each step** in the rail: reading the site; finding the brand in Qloo (if it isn't there: "that's normal for a young brand; I'll use brands like you"); matching stockists to Qloo places; choosing comparable brands.
2. **Up to three inline questions**, shown as chips in the rail. Each appears **only when the brief left that gap**, whether or not Qloo knows the brand. Athena **never waits**: it uses the default, keeps going, and an answer re-runs only the blocks that depend on it.

   | Question | Asked when | Default if ignored | An answer re-runs |
   |---|---|---|---|
   | **Where are you sold? Paste anything.** | No stockists in the brief, none on the website, and the motions include venue or retail | No accounts; brand plus comparables | Places, Read card, stage |
   | **Is this you?** (Yes / No / Skip) | Qloo returns more than one plausible brand, and the brief didn't settle it | The best-fitting candidate | Markets, Partners, Message, Moments |
   | **Swap any comparable brands?** (chips) | The founder named no comparables, so Athena chose them | Athena's choice | Every block that uses comparables |

3. **The plan streams in block by block**, each as soon as its calls return, in the recipe's order.
4. **"Built from" panel:** one line on what the plan rests on ("Brand in Qloo · 22 of 38 stockists matched · 3 brands like you"). Every guessed or defaulted item is marked, and clicking it reopens that question.
5. **Without Qloo** on Places, capped (§14.5), as before.
6. **Pipeline:** kept in an anonymous session for 7 days. The brief is kept with it, so a returning founder doesn't start over.

---

## F3 (replaces the row)

| F3 | Brief canvas (required facts inferred from Qloo or the website first, and confirmed with one tap): required text plus optional attachments (images, PDF, TXT, CSV, XLSX, PPTX, DOCX, URLs), turned into one brand brief (§9.22); follow-up questions until the four required facts are known; up to three inline questions during the run, each defaulted and never blocking | M10 | P0 | A brand in Qloo, given only its name and city, reaches **Build my plan** with ≤ 2 taps and no typed follow-up; a one-sentence description plus follow-ups produces a plan; a 20-row store-list screenshot yields ≥ 16 correct stockists; a 40-row XLSX yields ≥ 38; a pitch-deck PPTX yields the right category and tier for ≥ 8 of 10 test brands; the checklist test proves the plan can't start with a required fact empty unless it's labelled guessed; no inline question ever blocks the stream |

---

## New §9.22 Ingesting brand context

**Goal:** many messy inputs in, one typed brief out. Everything downstream (`prepareCustom`, the blocks) reads only the brief.

```ts
type Sourced<T> = { value: T; source: { kind: "message" | "file" | "website" | "agent_guess"; ref?: string } };

type BrandBrief = {
  name?: Sourced<string>;
  sells?: Sourced<string>;                 // what it sells, ≤ 160 chars
  howBought?: Sourced<Motion[]>;           // maps to motions (§7.1)
  activeCity?: Sourced<string>;            // a US city, or "none yet"
  websites: Sourced<string>[];             // ≤ 3, checked as in §9.20
  stockists: Sourced<{ name: string; address?: string; city?: string }>[]; // ≤ 200
  comparables: Sourced<string>[];          // ≤ 5
  competitors: Sourced<string>[];          // ≤ 3
  tierHint?: Sourced<Tier>;
  stageHint?: Sourced<"prelaunch" | "early" | "scaling">;
  notes: Sourced<string>[];                // anything else useful, ≤ 10 short lines
};
```

**One route per file type**, chosen so Gemini only ever sees formats it reads natively. Vertex reads PDF, plain text and PNG/JPEG/WebP images natively, up to 15 MB per file (Vertex docs, checked 9 Oct). Office files are not native, so Athena extracts them first:

| Input | How Athena reads it | What reaches Gemini |
|---|---|---|
| Message text | As-is | Text |
| Image, pasted screenshot | Native | The image |
| PDF | Native | The PDF |
| TXT, CSV | Read as text on the server | Text; CSV keeps its header row |
| XLSX | Parsed on the server into CSV, one block per sheet, ≤ 2,000 rows a sheet | Text |
| PPTX | Unzipped on the server; slide text and speaker notes in slide order; embedded images ≥ 200 px kept (≤ 10 a deck) | Text, plus those images |
| DOCX | Unzipped on the server; paragraph and table text | Text |
| URL | Never fetched by Athena's server; read by the URL context tool (§9.20) | Gemini reads it |

**Two steps, so tables are never paraphrased:**

1. **Rows first, in code.** Any CSV, XLSX sheet or DOCX table that has a name-like column and an address- or city-like column is treated as a stockist list and turned into rows by column matching in code, not by the LLM. Only lists it can't match by column (screenshots, PDFs, free text) go through `parseAccounts`.
2. **Then one Gemini Flash call** with all remaining text and images returns the brief as JSON (structured output, schema above), each field with its `source.ref`. Content is data, never instructions, as in §9.20.

**Merging across turns:** each new message or file re-runs only step 1 and 2 for the new input, then merges into the brief. A field the founder typed always beats one read from a file, which always beats a guess. Conflicts ("your deck says premium, your sheet's stockists average price level 1.6") are shown, not resolved silently; evidence rules from §7.2 still apply.

**Mapping to today's code:** the brief converts to the existing `BrandInput` (`lib/agent/intake.ts`), so Phase 2 reuses `prepareCustom` with three changes: it accepts pre-parsed stockists, it emits inline questions with defaults instead of stopping on `needs_input`, and it accepts answers (confirmed brand ID, swapped comparables, added stockists) on a re-run.

---

## §13.2 Screens (add)

- **Brief canvas** (own brand, Phase 1): a chat panel on the left, the live "What I understood" card on the right (stacked on phones). It switches to the normal workspace (§13.1) when the plan starts; the conversation stays available from the rail.

---

## §14.5 Limits and security (add under Input)

- **Uploads:** ≤ 10 files per brief, ≤ 15 MB each, ≤ 40 MB in total. The type is checked from the file's bytes, not its name. Files are processed in memory and never stored; only the brief is kept with the session. Macros and embedded objects in Office files are ignored.
- **Follow-ups:** ≤ 4 follow-up turns and ≤ 6 Gemini ingestion calls per brief; they count toward the own-brand cap.

---

## Open items

- **[VERIFY]** Parsing libraries for XLSX, PPTX and DOCX: pick ones that run in Node with no native binaries (for Cloud Run), and check their licences and versions before adding.
- **[VERIFY]** Gemini's per-request limit on images when a deck has many; the cap of 10 above is a guess until tested.
- **[DECISION]** Whether Phase 1's follow-ups use Flash (fast, cheap) or Pro. Default: Flash.
