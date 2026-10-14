# Cloud handoff: building PRD v5.0 §23.2 step 6

This is a **guide** for a cloud Claude Code session. It is not the spec.

- **The spec is `ATHENA PRD.md` §23**, especially the §23.2 table, row 6. Where this file and the PRD disagree, the PRD wins.
- **Branch:** `complete-rework`. It starts at `70a18af` ("v5 step 5: most valuable fits"); local and origin are both there. Work only on this branch. Don't open a PR or merge to `main`.
- The founder will pull this branch locally afterwards, then run the live checks with real keys there.

---

## 1. Start here (do this before any edit)

1. Read `CLAUDE.md`.
2. Read `ATHENA PRD.md` §23 **in full**:
   - §23.1 holds the founder's problems, verbatim;
   - §23.2 holds the build order, with each step's spec and "done when";
   - §23.3 is the coverage table;
   - §23.4 holds the rules and open items.

   Read the earlier sections only when §23 points to them. `PLAN v4.md` is a superseded draft and isn't in the repo; never build from it.
3. `CLAUDE.md` says to re-read `MEMORY.md` and `build-status.md`. Those files live on the founder's machine and **don't exist in the cloud**. **Sections 3 and 6 of this file replace them.**
4. Read the code named in section 5 before planning. Read `lib/agent/fits.ts` and `app/api/fits/route.ts` end to end, because step 6 copies their pattern.
5. Before writing code, write a short plan for step 6:
   - which files;
   - which parts of the spec each file covers, mapped (a) to (f);
   - how each "done when" will be checked.

   Show the plan to the founder and wait for their go. Founder decisions are theirs; ask only founder-only questions, with 2–4 concrete options.

## 2. Where the project is

Athena is a Qloo hackathon entry; submission is **28 Oct**, the only real date. Stack:
- Next.js 16.4, React 19.3, TypeScript 5.9;
- Gemini on Vertex (ADC);
- Qloo hackathon API, with two keys rotated;
- Firestore and Cloud Run planned for the deploy.

| §23.2 step | State | Commit |
|---|---|---|
| 1 Date in every prompt | done, verified live | b0620fe |
| 2 Agent core | done, verified live | b0620fe |
| 3 Onboarding playground | done, verified live | 86819dc |
| 4 Crawl and ingestion | done, verified live | 8a631fb |
| 5 Most valuable fits | done, verified live | 70a18af |
| **6 A strategy for every most valuable fit** | **not started: build this** | none |
| 7–10 | not started; **out of scope here** | none |

**Step 5's live result** (Fishwife, a saved journey with 205 facts):
- Win first: Curated Foodie Folk, 0.61;
- Watch: Soulful Singer Family, 0.44;
- weights moved by context: reach 1.5×, efficiency 1.4×, fit 1.3×, signal 1.2×, each citing the deck;
- 5 stockist metros excluded as already the brand's.

**Step 5's known caveats** (don't fix them unless step 6 needs it):
- agent titles and weights vary from run to run;
- after a probe, the old ranking shows until the re-rank;
- day counts use the US/UTC date.

**Decided, so don't reopen:**
- 6(b), "other actions per fit", is **deferred to the next rework iteration** (founder, 15 Oct). Build step 6 on the existing actions: who, where, through what, when, plus the existing per-crowd stops. Don't ask for the list.
- §23.1 is verbatim from the founder; never edit it.

## 3. Standing rules (from the founder; non-negotiable)

**Process**
- **Ask before** any PRD edit, any commit, any push, and before making the repo public. Only a plain yes counts ("yes commit", "push it").
- A question like "so we can just push?" is **not** approval. Answer it and wait.
- If a build finding conflicts with the PRD, report it and propose the edit. Don't edit the PRD yourself.
- Don't start scope the founder hasn't asked for. No step 7 (Brand Graph), no step 8 (goals and plays as tools), and no general rework of the old journey or chat; §23.2 schedules those for steps 7–8.
- **No invented dates:** never put dates, deadlines or schedules on plan steps. Give order and done-when only.
- Never add to `problems.md` without discussion and an explicit "add".
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never commit `.cache/`, `.env`, or the founder's untracked local files (`PLAN v4.md`, `ux-pattern-audit.md`, `fits-full.sse`, the Ideabrowser zip). In the cloud they won't exist, but don't create files with those names.

**Secrets and data**
- Secrets live **only** in `.env` on the founder's machine. In the cloud:
  - don't create `.env`;
  - don't ask for keys;
  - don't hard-code keys;
  - don't make live Qloo or Gemini calls.
- **No Qloo data in the repo.** Test fixtures must be **fictional and synthetic** (invented brands, crowds, numbers), never copied Qloo responses.
- **Zero spend** beyond the $300 GCP credit.
- **Verify before claiming:** any price, limit, licence or API behaviour gets checked against official docs or a live call. Otherwise mark it **[VERIFY]**.

**Product rules (PRD §23.4, plus memory)**
- **No failure states in the UI.**
  - Never show "failed", "not found", "unknown" or an error row. Show only confirmed results, and leave out what isn't confirmed.
  - Every external call has a hard time limit, falling back silently: retry, then the last good result, then skip.
  - Nothing hangs; slow work is narrated live with the agent's real steps.
- **Real agent, not a demo.** Everything must work live for **any** consumer brand typed in, not only the demo packs. Demo caches are only a speed-up.
- **Agent reasoning, not keyword rules.** Fix understanding bugs by giving the model context (the brief, the facts, the sources, freedom), never with regexes or per-case mappings. Code enforces only guardrails: required facts, caps, no repeated questions, a best-guess escape.
- **Understated Qloo copy.** No "Qloo did X" banners or badges. Use one muted method line per block ("Ranked by how closely…"), and let the call counts and source tags carry the Qloo name.
- **Never ask the founder to judge taste.** Athena ranks the crowds and says what to do. Founder questions cover only founder-only facts: budget, goals, margins, capacity, constraints, launch dates.
- **Wording:** "most valuable fits", never "predicted yield" or predicted sales.
- **Locations:** any location goes through the place resolver (`resolveTyped` / `locationParams` in `lib/places`), never raw `filter.location.query` with founder text.
- **Bench integrity:**
  - never re-run or retune the prereg-v2 held-out brands;
  - never claim Athena or Qloo ranks stockists better than an LLM;
  - every Bench line carries Gemini's number;
  - disclose any method change made after the tag;
  - Bench methods stay deterministic tools, exactly as registered. Step 6 must not change how any registered method scores.

## 4. Step 6: what to build

Read the PRD row. In short:

- **(a)** Each top fit (Win first and Win next, and Watch where useful) gets **its own strategy**:
  - who, where, through what, and when;
  - framed as **what to do now, what next, and what before each moment** (from the step 5 calendar).

  It answers "what if I went after this crowd".
- **(b)** Deferred (see section 2).
- **(c)** **Context changes the actions:**
  - stockists the brand already has aren't suggested again;
  - **budget** sets the channel mix;
  - a **launch date** moves the calendar;
  - **capacity** limits how many regions at once.
- **(d)** **Every result shows which context shaped it, with the source**, for example "Ranked higher because your deck says 60% of sales are in California". Facts come from step 4's knowledge base (`liveFacts()`), each with its file, page, slide or cell.
- **(e)** **Tailored throughout:** the brand's own products, stockists and numbers, never generic advice.
- **(f)** Remove "Plan for this crowd instead":
  - `components/Fits.tsx:199` (FitCard);
  - `components/Journey.tsx:848` (CrowdStop);
  - check for `crowdChosen` and the `onChoose` wiring at `Journey.tsx:154,216,463`.

  Keep old saved journeys loading: leave optional types in place, as step 5 did for pins.

**Done when:** "Each top fit has its own sourced strategy and actions, and changing one context fact changes the matching action."

## 5. Code map (read these)

**Agent core**
- `lib/agent/loop.ts`:
  - `runAgent(run)` and `DEFAULT_BUDGET` (`{qloo:150, ms:150_000, turns:10}`);
  - `Finisher` (`declaration`, `checking`, `checked`, `check(args, sources, state)`, which returns problems, a result and a summary);
  - `CLAIMS`.

  Given sources go in the first user turn, and the code fallback runs on a stall.
- `lib/agent/cite.ts`: `checkClaims` rejects any number with no source.
- `lib/agent/tools.ts`, the registry: `qloo_search`, `qloo_insights`, `qloo_demographics`, `build_taste_graph`, `probe_entity`, `crowd_geography`, `taste_axes`, `crowd_bridges`, `wikipedia_momentum`, `ticketmaster_events`, `census_market`, `web_search`, `read_website`, `rank_fits`, `brand_calendar`, `ask_founder`, `finish`.

  §23.2 says that from step 3 on, **features are agent tools plus a goal, never a new fixed stop**.

**Step 5, the template for step 6**
- `lib/agent/fits.ts`:
  - `FITS_SYSTEM` and `FITS_BUDGET` (`{qloo:150, ms:150_000, turns:9}`);
  - `fitsGiven` (the brief, then the knowledge facts, files first, chunked at `PART = 7500` so nothing is cut, then the crowds);
  - `fitsIntro` and `fitsTools`;
  - `fitsFinisher`: `finish_fits` with headline, reasons and assumptions; `checkClaims`; no numbers in the headline;
  - `FitsEvent`.
- `app/api/fits/route.ts`: the agent streams events, and the **code fallback** (`rankFits` + `gatherEvidence`) runs when no LLM is configured, the limit is hit, or the agent fails. It is rate-limited (12/hour).
- `lib/fits/`:
  - `score.ts`: `rankFits`, `paramScores`, `weightsOf`, `nextPeak`;
  - `calendar.ts`: `buildCalendar`, moments with `startBy` and lead times;
  - `gather.ts`;
  - `types.ts`: `Fit`, `FitsResult` with `excluded` (stockist metros already the brand's), `WeightChange` with sources, `Calendar`, `Moment`, `SourceRef`.
- `components/Fits.tsx`: tiers, `FitCard`, `Cites` (source ids, named on hover), "What your context changed", and `When`.
- `lib/journey/types.ts`: `FitsRun` and `JourneyState.fits` / `crowdId` / `crowdChosen`.
- `lib/knowledge/types.ts`: `Fact` with `topic`, which covers brand, product, price, customer, channel, stockist, sales, goal, budget, plan, team, competitor, press and other; plus `where[]` and `liveFacts()`.

**Existing per-crowd actions that step 6's strategy builds on**
- `lib/journey/growth.ts`: `GROWTH` maps each growth type to its stops. The `StopId` values are product, growth, crowd, where, places, retailers, partners, online, message, moments and go.
- `lib/blocks/`: markets, places, partners, message, moments, fingerprint, run and types. They run through `lib/agent/plan.ts` `runCustomPlan` and `app/api/plan`.
- `lib/stops/retailers.ts` and `online.ts` run through `app/api/stop`.
- `app/api/take` gives the per-stop LLM takes.
- `components/Journey.tsx`:
  - `signalFor(s)` / `inputFor(s)` (around line 276) feed the chosen crowd's signal into each stop;
  - `CrowdStop` is at line 785.

**Environment facts**
- `lib/env.ts`: fixtures are on when `ATHENA_FIXTURES=1` **or when no `QLOO_API_KEY` is set**. In the cloud, Qloo therefore serves synthetic fixtures (`lib/qloo/fixture.ts`).
- `llmConfigured()` is false with no `GOOGLE_CLOUD_PROJECT`, so every agent route takes its **code fallback** in the cloud. That makes the fallback path testable there; the agent path isn't.
- Commands:
  - `corepack pnpm install`
  - `corepack pnpm exec tsc --noEmit -p .`
  - `corepack pnpm exec vitest run` (284 tests pass at 70a18af)
  - live tests: `corepack pnpm live <file>`. **Local only.**

## 6. How to keep quality with no live calls

The cloud can do the structure, the deterministic logic, the unit tests, the UI and the type-checks. The agent's prompt tuning and the done-when checks need real Qloo and Gemini, so they happen locally after the pull. To make the local pass short and the result just as good:

1. **Put the context-to-action effects in deterministic code**, as step 5 did with the weights and `excluded`. The agent reads the facts and passes structured context *with source ids*. Code then applies it, so it's testable offline, and "changing one fact changes the matching action" is a unit test, not a hope. Each rule below keeps its source:
   - existing stockists are filtered out of the suggested retailers and places;
   - budget sets the channel mix;
   - the launch date shifts the calendar's start-by dates;
   - capacity caps the regions at once.

   The agent decides *what the facts mean*: that is model context, not keyword rules. Code only applies the decision and guards it, for example "budget change with no source is rejected", as `weightsOf` does.
2. **Follow the step 5 pattern exactly:**
   - a system prompt with today's date (automatic through `lib/llm/vertex.ts`);
   - given sources with files first and nothing cut;
   - a `Finisher` with `checkClaims`;
   - a budget and caps;
   - the streamed narration of the real steps;
   - `ask_founder` only for founder-only facts (budget, capacity, launch date), with suggested answers and stated assumptions;
   - a **code fallback** so there is never a failure state.
3. **Reuse, don't duplicate.** Strategies should call the existing blocks and stops (retailers, places, partners, online, message, moments) as tools or inputs where they fit, not re-implement them.
4. **Unit tests** in `tests/strategy.test.ts`, using **fictional fixtures only**. Cover:
   - each (c) rule flipping its action when one fact changes;
   - each action carrying its source;
   - the strategy being built for every top fit;
   - the fallback strategy existing with no LLM;
   - (f): the button is gone, and old saves still load.
5. **Write the live check for the local session:** `tests/live/strategy.live.ts`. It scripts the done-when: run the strategy for a brand, change one fact (budget, then launch date, then capacity, then an existing stockist), re-run, and print the action diff. It must redact keys, never touch prereg-v2 held-out brands, and keep the Qloo calls modest (each key has 10k/month).
6. **UI:** match `Fits.tsx` (the cards, `Cites`, small muted method lines, `shimmer-text` narration). Check that there's no horizontal scroll at 375px. A dev server can run in the cloud on the fallback path with fixtures (`corepack pnpm dev`) if a browser preview is available. If it isn't, say so and leave the visual checks for local.
7. Before handing back: `tsc` is clean, all tests pass, and no secrets or Qloo data are in the diff (`git diff --stat`, then read it).

## 7. Commit and push

- When the build is done, report to the founder:
  - what was built per (a) to (f);
  - the test count;
  - what still needs the local live check.
- **Ask** before committing. Commit on `complete-rework` with a message like `v5 step 6: a strategy for every most valuable fit`, ending in the Co-Authored-By line.
- **Ask** before pushing. The push is what lets the local session pull, so ask for it explicitly at the end.

## 8. After the pull (the local session does this, not the cloud)

1. `git pull` on `complete-rework`, then `tsc` and `vitest`.
2. Live with keys:
   - the Fishwife saved journey (full knowledge base);
   - a brand outside the demo packs;
   - `tests/live/strategy.live.ts`, showing the one-fact diffs.
3. Tune the strategy prompt from what the live runs show (model context, not rules).
4. Check in the browser that each top fit has its own sourced strategy, that context lines cite their sources, and that the phone layout works. Take screenshots.
5. Update `build-status.md` and report to the founder. Ask before committing the fixes.

## 9. Reminders to raise at the right time (don't start them)

- **Other actions per fit:** after this rework is done.
- **The Bench write-up** (Bench page, Method page, Devpost): before submission; the founder said later.
- **Fast search API** (Tavily first, Google as fallback): the founder said later.
- **A higher Qloo limit request:** still open.
