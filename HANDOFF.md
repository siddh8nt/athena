# Handoff: building PRD v5.0 §23.2 steps 8.8 and 8.7

This is a **guide** for a new Claude Code session on the founder's machine, in this same folder. It is not the spec.

- **The spec is `ATHENA PRD.md` §23.** For this handoff that means the §23.2 table (rows 8.7 and 8.8), **§23.7** (step 8.8) and **§23.6** (step 8.7). Where this file and the PRD disagree, the PRD wins.
- **Branch:** `complete-rework`, at `176caff`. It is 13 commits ahead of `origin/complete-rework`, none of them pushed. Work only on this branch, and don't open a PR or merge to `main`.
- **The session runs locally** with the founder's real keys in `.env`, so live checks run here.

---

## 1. Start here (do this before any edit)

1. **Read `CLAUDE.md`.**
2. **Read `ATHENA PRD.md` §23 in full:**
   - §23.1, the founder's problems, verbatim;
   - §23.2, the build order;
   - §23.3, coverage;
   - §23.4, the rules;
   - §23.5, step 8.6 in detail, items (a)–(r). Its (p), (q) and (r) are the most recent UI decisions;
   - §23.6, step 8.7;
   - §23.7, step 8.8.

   `PLAN v4.md` is a superseded draft. Never build from it.
3. **Memory:** `CLAUDE.md` says to re-read `MEMORY.md` and `build-status.md` in the Claude Code memory folder (`~/.claude/projects/C--Users-siddh-OneDrive-Desktop-BUILDING-QLOO-HACKATHON/memory/`).
   - If this account can see them, read them. Their last entries match this file.
   - If it can't, sections 2 and 3 of this file replace them.
4. **Ask the founder which step to build first:** 8.8 or 8.7. Both are specced and neither is built. The order against §23.5 (r) is the founder's call.
   - 8.8 is smaller, and clears what judges and founders see.
   - 8.7 is the larger feature step.
5. **Before writing code, write a short plan for that step:**
   - which files;
   - which spec items each file covers;
   - how each "done when" will be checked.

   Show the plan to the founder and wait for their go.

## 2. Where the project is (27 Oct)

Athena is a Qloo hackathon entry. Submission is **28 Oct**, the only real date.

**Stack:**
- Next.js 16 with React 19 and TypeScript, using pnpm through corepack;
- Gemini on Vertex, through ADC;
- the Qloo hackathon API, with two keys rotated;
- Firestore and Cloud Run for the deploy. The Cloud Run preview is on rev 00002 and has not been redeployed.

| §23.2 step | State |
|---|---|
| 1–8.6, including §23.5 (a)–(r) | Built and verified live. Commits are in `git log`; the latest app commit is `fb163c4`. |
| **8.7 Athena in the founder's own tools** (§23.6) | Specced in `176caff`. **Not built.** |
| **8.8 Dev mode out of the founder's UI, and a polish pass** (§23.7) | Specced in `176caff`. **Not built.** |
| 9 The context test, 10 QA, deploy and write-up | Not started. Out of scope here. |

**Checks at `fb163c4`:** tsc is clean, and vitest passes 629/629.

**No known open bugs.**

**What a pass on the dev server found for 8.8** is listed in §23.7 under "What a pass on the dev server found". Where it lives in the code:

- **Dev mode:**
  - the "Open dev mode" link is at `components/Onboard.tsx` ~599–604;
  - the pills are in `components/DevTape.tsx` (they return `null` in Live) and are mounted in `app/layout.tsx:26`;
  - `/dev` is `app/dev/page.tsx` (it calls `notFound()` in production), with the step map in `app/dev/DevMap.tsx` and tapes in `lib/dev/`.
- **Overview's step cards** show `step.task`, the brief Athena writes for each subagent. The briefs are written in `lib/agent/workflow.ts` and `lib/agent/athena-plan.ts`, and shown in `components/Dashboard.tsx` (~67 and ~202).
- **The team cards' lines** are the subagents' run summaries (`lib/agent/team.ts`, `lib/agent/specialists.ts`). Fix their voice through prompt context, never with text filters.
- **Execute Plan's card on Overview:** `components/Dashboard.tsx` ~100–120, which holds the counts line and "Start the Executive". Its summary sentence also shows in Athena's team card, and those two are the duplicate.
- **The Execute Plan page:** `components/Executive.tsx` and `lib/exec/`.
- **The first onboarding screen:** `components/Onboard.tsx` (cards and chips), styled in `app/globals.css`.
- **The landing page:** `app/page.tsx`, `app/landing.module.css` and `app/HeroGlow.tsx`.

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

**Topics the founder will raise later (don't start them):**
- brand safety;
- the New York goal;
- how crowds are named, including subagent pages naming crowds differently from the Analyst;
- the win-first disagreement;
- the Bench write-up;
- the fast search API;
- the Qloo limit request;
- a second gcloud key;
- switching Flash back to 3.8 if it recovers.

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

**Production check for 8.8:** `corepack pnpm build`, then `corepack pnpm start`. Ask before redeploying Cloud Run (`docs/DEPLOY.md`).

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
