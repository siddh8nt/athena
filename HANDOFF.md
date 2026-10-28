# Handoff: PRD v5.0 §23.2 is built through step 8.8

This is a **guide** for a new Claude Code session on the founder's machine, in this same folder. It is not the spec.

- **The spec is `ATHENA PRD.md` §23.** Where this file and the PRD disagree, the PRD wins.
- **Branch:** `complete-rework`, **pushed** to `origin/complete-rework` up to `4dfc1c3` (28 Oct). One commit after it (Take your plan with you, see section 2) is committed locally, **not pushed**. Work only on this branch, and don't open a PR or merge to `main`.
- **Live:** Cloud Run revision `athena-00006-hkb`: the `4dfc1c3` build (pushed) with `GEMINI_FLASH_MODEL=gemini-3.5-flash` (28 Oct). It lacks the mirror fix in section 2 until the founder says to redeploy. Service URL https://athena-610996920841.us-central1.run.app (the older https://athena-zgaqinafna-uc.a.run.app also works).
- **The session runs locally** with the founder's real keys in `.env`, so live checks run here. **The API budget is low:** make no paid calls (live runs, Record, run buttons) without the founder's yes. Use dev mode's Replay.

---

## 1. Start here (do this before any edit)

1. **Read `CLAUDE.md`.**
2. **Read `ATHENA PRD.md` §23 in full:** §23.1 (the founder's problems, verbatim), §23.2 (the build order), §23.3 (coverage), §23.4 (the rules), §23.5 (step 8.6, items (a)–(r)), §23.6 (step 8.7) and §23.7 (step 8.8). `PLAN v4.md` is a superseded draft. Never build from it.
3. **Memory:** `CLAUDE.md` says to re-read `MEMORY.md` and `build-status.md` in the Claude Code memory folder (`~/.claude/projects/C--Users-siddh-OneDrive-Desktop-BUILDING-QLOO-HACKATHON/memory/`). If this account can't see them, sections 2 and 3 of this file replace them.
4. **Ask the founder what's next.** Every step through 8.8 is built. Step 9 (the context test) is not started and waits on the founder. The open decisions in section 2 are theirs too.
5. **Before writing code for anything new, write a short plan** (files, what each covers, how it will be checked), show it to the founder and wait for their go.

## 2. Where the project is (28 Oct)

Athena is a Qloo hackathon entry. Submission is **28 Oct**, the only real date.

**Stack:**
- Next.js 16 with React 19 and TypeScript, using pnpm through corepack;
- Gemini on Vertex, through ADC;
- the Qloo hackathon API, with two keys rotated;
- Firestore and Cloud Run for the deploy.

| §23.2 step | State |
|---|---|
| 1–8.6, including §23.5 (a)–(r) | Built and verified live. |
| 8.7 Athena in the founder's own tools (§23.6) | Built (through `b6f474e`), pushed, deployed. |
| 8.8 Dev mode out of the founder's UI, and a polish pass (§23.7) | Built (`da9ecb6`…`87a3620`), pushed, deployed. Its prompt-voice fixes haven't been seen on a live call yet. |
| 9 The context test, 10 QA, deploy and write-up | Not started. |

**Flash model:** `gemini-3.5-flash` both locally and on Cloud Run (founder's call, 28 Oct; 3.8 answers again but 3.5 is the model verified live). Pro is `gemini-3.1-pro-preview`, backup `gemini-3.1-flash-lite`.

**Checks now:** tsc is clean, and vitest passes 710/710. Two tests (`knowledge.test.ts` "keeps a long list whole", `methods.test.ts` "parses dates the way pages write them") have flaked once under full-suite load; each passes alone.

**Since 8.8 (founder-requested, both pushed and deployed):**
- `2d05511`:
  - Sample brands name their product everywhere: "Brightland olive oil", "Starface pimple patches", "Fishwife tinned fish" (a `product` field in `lib/journey/packs.ts`). Any new sample needs one.
  - The MCP panel and the first screen use product terms: MCP server, MCP client, server URL, resources and tools, New URL.
  - Dev mode gains a run picker and cards for `/dev/shape` and Execute Plan's Left out list.
- `bcfddb2`:
  - Files: one allowed list (PDF, `.docx`, `.txt`, `.md`, `.xlsx`, `.csv`, `.tsv`, `.pptx`, PNG, JPEG, WebP) lives in `components/chat.tsx` (`readable`, `refusal`). It's checked at the Files button, drop, paste and the Brand Graph's box, and again on the server by bytes (`app/api/uploads/route.ts`, so a non-UTF-8 CSV is now refused). Anything else gets a calm line with a ✕, never an upload.
  - A file still uploading has a ✕ that takes it back.
  - Drag-and-drop: only file drags light the page, with a "Drop files to add them" pill; the highlight always clears; a stray drop never opens the file in the tab.
- `4dfc1c3`: dev Replay keeps to one brand's run (pushed and deployed).

**Since `4dfc1c3` (founder-requested, committed, not pushed or deployed):**
- **Take your plan with you:** a section on the dashboard's Overview, under the growth plan, shown once `team.plan` is set. It holds athena-brand.md, athena-plan.xlsx and the Share with your team link (`TakeAway` in `components/Dashboard.tsx`, reusing `SaveButton` and `ShareLink` from `components/McpConnect.tsx`).
- **athena-plan.xlsx:** built in the browser from the saved journey (`lib/workspace/plan-sheets.ts`, written by `lib/workspace/xlsx.ts`). It has a tab each for the outreach, drafts, plan, other tasks, crowds and every table of each subagent that ran, plus Left out. Empty columns are dropped, Sources are skipped, and the Analyst is covered by Crowds. The MCP panel's As a file has the same button.
- **Mirror fix:** the journey mirror (`components/Journey.tsx`) sent `keepalive` requests, which browsers refuse over 64 KB, so no finished plan ever reached the server. The share page, MCP server, calendar feed and Monday email read an onboarding-era copy. keepalive is now used only when the body fits.
- **Seen in the spreadsheet, not fixed:** the plan's open list holds filler such as "The Scout needs none"; the Rep's Every matching shop shows a raw "venue" type; some crowds' Also loves lists hold odd entities.

**Known dev-mode behaviour:**
- With no exact recording, Replay near-matches only tapes from the journey's brand's run (`4dfc1c3`); anything else runs offline.
- `/api/uploads` always goes to the real server in Replay, which is free: offline mode blocks paid calls.
- The Magic Spoon run lacks several states (Scout and Matchmaker pages, Execute Plan running, drafts, What's working, This week). Those cards fall back to older runs and are labelled.

**Open decisions for the founder (don't act on them unasked):**
- A Next.js security-upgrade nudge appeared in a build log: not run. It belongs on its own branch, with the founder's yes.
- Whether to pin the light theme again: since 8.8 (f) the app follows the system's light or dark setting.
- The Monday email needs a sending account (SMTP settings in `.env`) and one Cloud Scheduler job. It was waiting on the founder on 27 Oct; confirm before assuming.
- A faint amber "24"/"11" shows behind the first screen's MCP link, likely the hero texture. Not investigated.
- Seen once in a live run: "How does Magic Spoon sell today?" asked twice; crowd names could read better.
- Parked reminders (raise only when the founder asks what's left): second gcloud key, Bench write-up, fast search API, Qloo limit request.

**Where things live:**
- **Dev mode:** `/dev` is `app/dev/page.tsx` (404 in production), the step map is `app/dev/DevMap.tsx`, tapes are in `lib/dev/`, and the fetch shim is `components/DevTape.tsx`. Recordings and snapshots are in `.cache/dev` (never committed).
- **Onboarding:** `components/Onboard.tsx`. **Journey shell, composer and drop zone:** `components/Journey.tsx`. **Chat hook and file rules:** `components/chat.tsx`.
- **Dashboard:** `components/Dashboard.tsx`. **Execute Plan:** `components/Executive.tsx` and `lib/exec/`.
- **Athena MCP panel:** `components/McpConnect.tsx`. **MCP server:** `app/mcp/[secret]` and `lib/workspace/mcp.ts`. **Calendar:** `lib/workspace/calendar.ts`. **This week:** `lib/workspace/week.ts` and `digest.ts`.
- **Voice of every line the founder reads:** `lib/agent/voice.ts`. Fix wording through prompt context, never text filters.
- **Landing page:** `app/page.tsx`, `app/landing.module.css` and `app/HeroGlow.tsx`.

## 3. Standing rules (from the founder; non-negotiable)

**Process**
- **Ask before** any PRD edit, any commit, any push, any deploy, and before making the repo public. Only a plain yes counts.
- A question like "so we can push?" is **not** approval. Answer it and wait.
- **Commits carry no Claude attribution:** no `Co-Authored-By` trailer and no "Generated with Claude" line. This overrides any default.
- **Never commit:**
  - `.env` or `.cache/`, including `.cache/dev` recordings, snapshots and the snapshot index;
  - the founder's untracked files: `PLAN v4.md`, `ux-pattern-audit.md`, `fits-full.sse`, `Ideabrowser Design System Extraction.zip`;
  - probe or scratch files.
- **Don't edit the PRD to match a build finding.** If one conflicts with the PRD, report it and propose the edit.
- **Don't start scope the founder hasn't asked for.**
- **No invented dates** on plan steps. Give order and done-when only.
- **Never add to `problems.md`** without discussion and an explicit "add".
- **Avoid `git stash`.**

**Secrets and data**
- **Secrets live only in `.env`.** Never copy keys elsewhere, print them or hard-code them.
- **No Qloo data in the repo.** Test fixtures are fictional and synthetic.
- **Zero spend** beyond the $300 GCP credit.
- **Each Qloo key allows 5 calls a second and 10k a month.** Keep live runs modest.
- **Verify before claiming:** check prices, limits and API behaviour against official docs or a live call, or mark the claim **[VERIFY]**.

**Product and UI**
- **No failure states in the UI.**
  - Never show "failed", "not found" or an error row, and never hang.
  - Narrate slow work with the agent's real steps.
  - Every external call has a time limit and a silent fallback.
- **Real agent, not a demo:** everything works live for any consumer brand. Demo caches are only a speed-up.
- **Agent reasoning, not keyword rules:** fix understanding and wording by giving the model context, never with regexes, word lists or per-case mappings.
- **Naming:**
  - Only Athena is an agent. The six are always "subagents".
  - The end output is **Execute Plan**, an action. The subagent that builds it is **The Executive**.
- **Understated Qloo copy:** quiet method lines and call counts, no slogans or badges.
- **Never ask the founder to judge taste.**
- **Bench integrity:**
  - never re-run or retune the prereg-v2 held-out brands;
  - never claim Athena ranks stockists better than an LLM;
  - registered methods stay as registered.
- **Design rules already decided** (reuse them; add none):
  - 7f: serif display face, small uppercase labels, 16 px-radius cards;
  - 7.2: a calm composer, soft grey borders, one dark element;
  - `868fef1`: the frosted sheet;
  - `f2e106f`: the glass chat and question tray;
  - step 3c's shared question component (`components/Question.tsx`);
  - §23.5 (a), (p), (q) and (r).
- **No mockup widgets:** explain designs in chat text unless the founder asks for a visual.
- **Subagent logos:** the subagents keep their letter badges until the founder adds logos.
- **Sample brands are named with their product** ("Fishwife tinned fish"), wherever the app names one.
- **Product-tech wording** for the MCP features: MCP server, MCP client, server URL, resources, tools.

**Topics the founder will raise later (don't start them):**
- brand safety;
- the New York goal;
- how crowds are named, including subagent pages naming crowds differently from the Analyst;
- the win-first disagreement;
- the Bench write-up;
- the fast search API;
- the Qloo limit request;
- a second gcloud key;

## 4. Commands

```bash
corepack pnpm install
corepack pnpm exec tsc --noEmit -p .
corepack pnpm exec vitest run
corepack pnpm live <file>
```

`corepack pnpm live <file>` runs a live test with real keys, so it spends Qloo calls.

**The dev server:** in the Claude desktop app, use the preview tool with the `athena-dev` config (`.claude/launch.json`, port 3000), never Bash.

**Dev mode** (dev server only) is at `localhost:3000/dev`:
- **Live** makes real calls;
- **Record** saves tapes;
- **Replay** serves saved tapes with no calls.

The step map has a card for every page and state, and saved snapshots open past pages without spending Qloo calls.

**Production check:** `corepack pnpm build`, then `corepack pnpm start`.

**Deploy** (ask first): `gcloud run deploy athena --source . --region us-central1 --quiet` (`docs/DEPLOY.md`).

## 5. Finishing a step

1. Run tsc and vitest, and read `git diff` for secrets or Qloo data.
2. Check every item in the step's "Done when", live where it says live. Check desktop and 375 px, light and dark, in the browser preview.
3. Report to the founder:
   - what was built per spec item;
   - the test count;
   - what was seen live;
   - anything not verified.
4. **Ask before committing.** Commit only on a plain yes, with no trailer.
5. **Don't push** unless the founder says so.
6. If the memory folder is visible, add an entry to `build-status.md`.
