# Cloud handoff: building PRD v5.0 §23.2 step 7

This is a **guide** for a cloud Claude Code session. It is not the spec.

- **The spec is `ATHENA PRD.md` §23**, especially the §23.2 table, row 7, and **§13.12 The Brand Graph**, which row 7 builds. Where this file and the PRD disagree, the PRD wins.
- **Branch:** `complete-rework`. It starts at `2ffd839` ("v5 step 6: verified locally, with fixes from live runs"). Work only on this branch. Don't open a PR or merge to `main`.
- The founder will pull this branch locally afterwards and run the live checks with real keys there.

---

## 1. Start here (do this before any edit)

1. Read `CLAUDE.md`.
2. Read `ATHENA PRD.md` §23 **in full**:
   - §23.1 holds the founder's problems, verbatim;
   - §23.2 holds the build order, with each step's spec and "done when";
   - §23.3 is the coverage table;
   - §23.4 holds the rules and open items.

   Then read **§13.12** (the Brand Graph) and **§13.11** (the Taste Galaxy the graph grows from). Read other sections only when these point to them. `PLAN v4.md` is a superseded draft and isn't in the repo; never build from it.
3. `CLAUDE.md` says to re-read `MEMORY.md` and `build-status.md`. Those files live on the founder's machine and **don't exist in the cloud**. **Sections 2, 3 and 6 of this file replace them.**
4. Read the code named in section 5 before planning. Read `components/Galaxy.tsx` and `components/chat.tsx` end to end: the graph grows from the first and replaces a card in the second.
5. Before writing code, write a short plan for step 7:
   - which files;
   - which parts of the spec each file covers, mapped (a) to (f);
   - how each "done when" will be checked;
   - your reading of the two open points in section 4.

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
| 6 A strategy for every most valuable fit | done, verified live (cloud build, then local fixes) | 38165ff, 2ffd839 |
| 7 The Brand Graph, 7.1, 7.2 | done, verified locally | 743c5e7, 22bf521, 475e995 |
| 8 Goals: Athena leads six specialists, 8.1 | built, unit-tested on fixtures; awaiting the founder's live run | 65ce3b5, 9dfc4ef |
| **8.2 Knowledge, not raw facts; a team panel that follows the goals** | **built, unit-tested and browser-checked on fixtures (15 Oct); awaiting the founder's live run** | see `git log` |
| 9–10 | not started; **out of scope here** | none |

**Step 8.2 state (15 Oct):**
- Built: `lib/knowledge/notes.ts` (themes, no-model grouping by source, merge that keeps the founder's edits and deletions, the model reply checked so every number appears in its raw facts), `lib/knowledge/synth.ts` and `/api/synthesize` (one flash pass, cached per workspace); `theme` and `source` node types, themes collapsed and opened from the node card, a note linked to the node it is about; the list by theme with "n sources"; note edits (edit, merge, split, move, delete; rename or remove a theme) from the graph, the list or chat, each one edit with Undo, deletions kept in `graph.gone`; notes by theme in the agents' context (`knowledge` in s1, and the fits' knowledge parts); the team panel shows Athena, the Analyst and the chosen goals' specialists, and folds to a remembered badge rail.
- Tested: `tests/knowledge-notes.test.ts` (401 tests in all), tsc and build clean; browser check at 1280 and 375 on a saved journey (themes collapsed, opened to a note and its source, an edit saved and undone, a theme removed, the rail remembered after a reload).
- Still needs a live run: a real brand's site plus a file giving 5–10 readable themes, a later file merging in, and a brand outside the demo packs.

**Step 8 state (15 Oct):**
- Built: `/api/team` (propose, custom, run, ask, analyst); `lib/agent/{specialists,goals,plays,team,team-ctx,outcomes,evidence,draft}.ts`; `lib/team/`; `components/Team.tsx`; Journey wiring (goals bar, left panel, workspaces, What's working, "Ask the Analyst about this").
- Tested: `tests/team.test.ts` and `tests/team-run.test.ts` cover two brands' paths, the weak crowd, the empty city (the Rep widens to the Navigator's next city), the one-way partner (dropped, the ask goes to the next), outcomes changing the next run, a new play as one registry entry, home-city goals, run records. 382 tests, tsc clean, build clean; browser check at 1280 and 375 on fixtures.
- Fixes found by the tests: picked goals with a comma in the label ("Win more of Portland, OR") were lost; "win more of home" chose a new city; `t.goals` held labels, so step-up never triggered; result refs and the pitch used item ids instead of Qloo ids.
- Still needs a live run: the model deciding (not code's rules), real neighbourhood names, mutual fit on live Qloo, re-runs after a live probe.

**Step 6's live result** (Fishwife, about 113 Qloo calls per run):
- every top fit gets its own sourced strategy;
- changing the budget, the launch date, capacity or an existing stockist changes only the matching actions;
- the `readContext` guard in `lib/strategy/build.ts` requires the founder's quoted words and every stockist name to appear in a cited source, and an unanswered `ask_founder` holds nothing.

**Known caveats** (don't fix them unless step 7 needs it):
- agent titles and weights vary from run to run;
- after a probe, the old ranking shows until the re-rank;
- day counts use the US/UTC date (held by decision);
- "$40,000 a month" reads as moderate in one run and ample in another, until the founder gives dollar ranges for the budget bands.

**Decided, so don't reopen:**
- 6(b), "other actions per fit", is **deferred to the next rework iteration**.
- **Never ask the founder to judge taste.** The graph has no "That's us / Not us" and no pins (§13.12, problems.md problem 1).
- §23.1 is verbatim from the founder; never edit it.

## 3. Standing rules (from the founder; non-negotiable)

**Process**
- **Ask before** any PRD edit, any commit, any push, and before making the repo public. Only a plain yes counts ("yes commit", "push it").
- A question like "so we can just push?" is **not** approval. Answer it and wait.
- If a build finding conflicts with the PRD, report it and propose the edit. Don't edit the PRD yourself.
- Don't start scope the founder hasn't asked for:
  - no step 8 (goals, and plays as the agent's tools);
  - no dollar ranges for the budget bands (the founder sets those);
  - no general rework of the journey beyond what step 7 needs.
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
  - Bench methods stay deterministic tools, exactly as registered. Step 7 must not change how any registered method scores.

## 4. Step 7: what to build

Read §23.2 row 7 and §13.12. In short:

- **(a) One graph, not two.**
  - A slim **fact strip** on top: name, what it sells, channel, tier, stage and home city, each with its source label and edited in place.
  - Below it, the **graph grown from the Taste Galaxy** (`components/Galaxy.tsx`), not a second graph beside it.
  - Together they replace the static "What I understood" card (`components/chat.tsx:195`).
  - The brand sits at the centre, with its comparables, competitors and stockists; the crowds and what they love (real Qloo entities); and the founder's facts as small labelled anchors.
  - It opens with about 15–25 nodes. A node type folds into a group past 12.
  - Every edge has a reason: comparable of, loved by [crowd], shares fans with, sold at, found by [play]. Hovering an edge shows its reason and source.
  - Every node shows its source: website, a file, Qloo, or you.
  - Crowd nodes carry their Win first / Win next / Watch tier and reason from step 5.
  - Time-sensitive nodes (moments from the step 5 calendar) show when they matter.
- **(b) A list view** beside it shows the same nodes as grouped lists, with the same actions. It is the main way to read the graph, and the phone layout (< 640 px).
- **(c) Edit facts, never taste.**
  - Click a node to open its card. **Remove** hides the node.
  - **Wrong** hides it *and* stops the agent inferring it again. This has to reach the agents' given sources (for example as a struck or wrong fact), not a keyword filter.
  - **Add by typing** a comparable, competitor, stockist or city. It is resolved through Qloo search (`lib/qloo`) or the place resolver (`resolveTyped` / `locationParams`). Nothing unresolved is added.
  - An unresolved addition becomes a question ("Did you mean …?") through the step 3 question component (`components/Question.tsx`), never an error.
- **(d) Chat edits** ("we're actually more premium", "we just got into Whole Foods", "skip Austin") go through the same merge rules as the brief (`mergeBrief` in `lib/brief/types.ts`): the founder's words beat a file, which beats a guess.
  - The changed nodes flash once with a one-line note ("Moved to premium: from your message") and **Undo**.
  - Working out what the message means is the model's job (context, not regexes); code applies the change and guards it.
- **(e) Stale flags.** Each edit marks the runs whose inputs changed as stale ("Cities may change: you added a comparable. Re-run?"), with a one-click re-run. Nothing re-runs silently, and nothing already decided is thrown away.
- **(f) Look and feel from the audit:** a serif display face, small uppercase labels, 16px-radius cards. Apply them to the graph, the strip, the list and the cards; don't restyle the whole app.
- **Registry:** node and edge types come from one registry, `lib/graph/types.ts`. A new node type is one entry, with no change to the graph view. Step 8 relies on this.
- **Library:** the Galaxy's existing `d3-force` (already a dependency), extended with zoom and pan. Colour **and** shape by node type, never colour alone. Respect reduced motion: the layout settles at once.

**Two open points.** Give your reading of each in the plan, and let the founder confirm:
1. **What "plays" means in (e) before step 8 exists.** Suggested reading: until step 8, the stale-able runs are the ones that exist now:
   - the fits run (step 5);
   - each per-fit strategy (step 6);
   - the journey stops and blocks (`app/api/stop`, `app/api/plan`).

   Each run records which facts and nodes it read, so an edit can flag exactly the runs it touched.
2. **Where the graph lives in the journey:** on the product stop, where the card is now, and whether it stays visible on later stops as the canvas (§13.1). Propose this; don't decide it.

**Done when** (§23.2 row 7): "An edit in chat and one on the graph each change the right nodes, show what changed, can be undone, and flag the right plays."

## 5. Code map (read these)

**What the graph grows from and replaces**
- `components/Galaxy.tsx` (446 lines):
  - `Galaxy`: the d3-force layout, hulls per crowd, `CrowdDecision` tier lines, and click-to-probe with `MAX_PROBES`;
  - `EntityCard`, `GalaxyList` and `Legend`.

  Step 5 removed That's us and the pins; their types are kept empty so old saves load.
- `components/chat.tsx:195`: the "What I understood" card to replace. `app/globals.css:272` styles the brief canvas.
- Where the card and the Galaxy are mounted: `components/Journey.tsx`, `JourneyPage.tsx` and `Workspace.tsx`.
- `lib/journey/types.ts`: `JourneyState`, `FitsRun` and the step 6 strategy runs.

**Facts and merging**
- `lib/brief/types.ts`:
  - `BrandBrief` and `Sourced<T>`;
  - `RANK` by source kind;
  - `mergeBrief` and `mergeList` (stockists, comparables and websites, with caps).
- `lib/brief/`: agent, conversation, extract, form, rows, to-input.
- `lib/knowledge/types.ts`: `Fact` (`topic`, `where[]`) and `liveFacts()`. Struck facts are already left out, so "wrong" can build on this.
- `lib/knowledge/merge.ts`: `compareFacts` and conflicts.
- `app/api/brief` and `app/api/onboard`: chat and brief updates today.

**Runs that can go stale**
- Step 5: `lib/fits/`, `lib/agent/fits.ts`, `app/api/fits`, `components/Fits.tsx`.
- Step 6:
  - `lib/strategy/` (build, picks, types);
  - `lib/agent/strategy.ts`;
  - `app/api/strategy`;
  - `components/Strategy.tsx`;
  - `components/Cites.tsx` (`Cites`, `readable()`).
- Stops and blocks: `lib/journey/growth.ts`, `lib/blocks/`, `lib/stops/`, `app/api/stop`, `app/api/plan`.

**Agent core** (if the chat edit uses the agent)
- `lib/agent/loop.ts`: `runAgent` and `Finisher`.
- `lib/agent/cite.ts`: `checkClaims`.
- `lib/agent/tools.ts`: the tool registry.

Follow the step 5 and 6 pattern:
- a system prompt with today's date;
- given sources;
- a finisher with checks;
- a budget;
- streamed narration;
- a **code fallback**, so there is never a failure state.

**Environment facts**
- `lib/env.ts`: fixtures are on when `ATHENA_FIXTURES=1` **or when no `QLOO_API_KEY` is set**. In the cloud, Qloo therefore serves synthetic fixtures (`lib/qloo/fixture.ts`).
- `llmConfigured()` is false with no `GOOGLE_CLOUD_PROJECT`, so every agent route takes its code fallback in the cloud.
- Commands:
  - `corepack pnpm install`
  - `corepack pnpm exec tsc --noEmit -p .`
  - `corepack pnpm exec vitest run` (**310 tests pass at 2ffd839**)
  - live tests: `corepack pnpm live <file>`. **Local only.**

## 6. How to keep quality with no live calls

1. **Put the graph logic in deterministic, testable code:**
   - building nodes and edges from the brief, the facts, the Galaxy, the fits and the strategies;
   - folding a type past 12;
   - applying an edit, and undo;
   - working out which runs are stale from what each run read.

   The model only decides *what a chat message means*. Code applies the change and guards it: an edit with no source is rejected, and an unresolved addition becomes a question.
2. **The chat-edit path needs a code fallback** that works with no LLM in the cloud, even if it only handles structured edits (the graph's own add, remove and wrong), so the UI never fails. Understanding natural language is the agent's job, and gets checked live locally.
3. **Reuse, don't duplicate:** the Galaxy's layout, the brief merge, `liveFacts()`, the question component, `Cites`, the place resolver and Qloo search.
4. **Unit tests** in `tests/graph.test.ts`, using **fictional fixtures only**. Cover:
   - the registry: a new node type is one entry, and renders with no change to the view;
   - 15–25 nodes at the start, and folding past 12;
   - every node has a source, and every edge a reason;
   - remove versus wrong: wrong stops the fact being inferred again;
   - an addition is either resolved or becomes a question;
   - a chat-style edit and a graph edit each change the right nodes, record what changed, undo cleanly, and flag exactly the runs that read the changed fact;
   - old saved journeys still load.
5. **Write the live check for the local session:** `tests/live/graph.live.ts`. It scripts the done-when on a real brand:
   - one chat edit, for example "we just got into <a store from the brand's own facts>";
   - one graph edit, for example adding a comparable;
   - for each, it prints the changed nodes, the undo result and the stale flags.

   It must redact keys, never touch the prereg-v2 held-out brands, and keep the Qloo calls modest (each key has 10k/month).
6. **UI:** match the existing cards, `Cites`, the muted method lines and the `shimmer-text` narration, plus (f). Check that there's no horizontal scroll at 375px; the list view is the phone layout. If a browser preview is available, run `corepack pnpm dev` on the fixtures. If it isn't, say so and leave the visual checks for local.
7. Before handing back: `tsc` is clean, all tests pass, and no secrets or Qloo data are in the diff (`git diff --stat`, then read it).

## 7. Commit and push

- When the build is done, report to the founder:
  - what was built per (a) to (f);
  - the test count;
  - what still needs the local live check.
- **Ask** before committing. Commit on `complete-rework` with the message `v5 step 7: the Brand Graph`, ending in the Co-Authored-By line.
- **Ask** before pushing. The push is what lets the local session pull, so ask for it explicitly at the end.

## 8. After the pull (the local session does this, not the cloud)

1. `git pull` on `complete-rework`, then `tsc` and `vitest`.
2. Live with keys:
   - the Fishwife saved journey (full knowledge base);
   - a brand outside the demo packs;
   - `tests/live/graph.live.ts`.
3. Tune the chat-edit prompt from what the live runs show (model context, not rules).
4. Check in the browser, on desktop and at 375px, that a chat edit and a graph edit each change the right nodes, flash with a note, can be undone, and flag the right runs. Take screenshots.
5. Update `build-status.md` and report to the founder. Ask before committing the fixes.

## 9. Reminders to raise at the right time (don't start them)

- **Dollar ranges for the budget bands:** the founder sets them. Then they go into STRATEGY_SYSTEM and the step 6 live script is re-run.
- **Other actions per fit (6b):** after this rework is done.
- **The Bench write-up** (Bench page, Method page, Devpost): before submission; the founder said later.
- **Fast search API** (Tavily first, Google as fallback): the founder said later.
- **A higher Qloo limit request:** still open.
