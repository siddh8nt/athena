# Athena progress

Last updated: 9 Oct 2026. The source of truth is `ATHENA PRD.md` (v2.12); this file is a summary for the team.

## What Athena is

Athena is a taste-led growth agent for consumer startups, built for the Qloo hackathon. A brand gets a growth plan built from Qloo taste data: where to grow, who to partner with, and which moments to use. The plan rests on the brand's stockists and on comparable brands that Qloo knows, so **Qloo doesn't need to know the brand itself** (which matters for young brands).

**Stack:** Next.js 16 and TypeScript (pnpm), Gemini on Vertex AI (global endpoint; 3.1 Pro and Flash), Vitest. The deploy target is Cloud Run with Firestore, paid from the $300 GCP credit.

## What's built

- Demo brands with precomputed plans, plus a live "Try your own brand" flow (`components/Intake.tsx`).
- How a plan is built (`lib/agent/plan.ts`): match the brand and its stockists to Qloo, pick comparable brands, then fill in the blocks (markets, partners, moments, podcasts).
- Extra data: Census (metros), Ticketmaster, Wikidata, Apple Podcasts, festival dates via Gemini with Search.
- **Public podcast numbers** (`lib/enrich/podcast-numbers.ts`, PRD §9.6). Gemini searches, and Athena then opens every cited page itself. A figure is kept only if:
  - the page loads and names the show;
  - the number appears within 200 characters before or 1,000 after the show's name;
  - for a sponsor page, the page is the show's own.

  Confirmed figures are saved until someone clicks **Search again**. Empty results are never saved.
- **Streaming fix** (`lib/llm/vertex.ts`): the last streamed event, which carries the end of the answer and its sources, used to be dropped. The parser now reads it.
- 82 unit tests pass (`corepack pnpm test`).

## Known limits

- **Podcast numbers:**
  - Gemini Pro doesn't return Google's sources for the podcast prompt, so some of the URLs it writes 404.
  - Muck Rack and Rephonic block automated visitors.
  - Results on 9 Oct: 2 of 4 shows got a confirmed figure (Fat Mascara, Breaking Beauty).
- **Cities:** "City to grow into" offers only 25 fixed metros (`lib/playbook/metros.ts`).
- **The own-brand flow** feels like a sign-up form, not an agent (see below).

## Agreed next steps (in order)

### 1. Rework the own-brand flow (branch `own-brand-flow`)

This is the biggest concern: the demos show Athena reasoning step by step, but your own brand starts with a static pop-up form. The proposed design, not yet in the PRD:

1. **One box:** "Tell me about your brand: a name, a website, or a sentence."
2. **Athena starts work at once and narrates each step:**
   - it reads the site and finds the stockists page;
   - it looks the brand up in Qloo (if it isn't there, it says that's normal for a young brand);
   - it matches the stockists to Qloo places;
   - it picks comparable brands.
3. **It asks only when stuck:** at most 2–3 inline, skippable questions, each with a reason:
   - "Where are you sold? Paste anything." (any format)
   - "Is this you?" (Yes / No)
   - "Swap any comparable brands?" (chips)
4. **The plan appears block by block** as each one is ready.
5. **A "built from" panel** shows what the plan rests on (e.g. "4 stockists + 3 lookalike brands").

- **Open question:** should Athena ask its questions before it starts working, or while it works?
- **Estimate:** 1–1.5 days. Needs a PRD §6.2 / M10 change first.

### 2. Rework cities (branch `cities`)

- Keep the 25 metros for the Markets ranking and the proof.
- Let "City to grow into" accept any US city: find its Census metro, check that Qloo returns venues there, and fall back to the nearest verified metro.
- Optionally grow Markets to the top 50 metros.
- Needs a PRD §9.3 change first.

### 3. Other open items

- **Ranking check (F27):** write and commit `proof/REGISTRATION.md` *before* running it.
- **Tests:** S17 (burst load) and S22 (website reading).
- **PRD edits awaiting OK:**
  - the Markets fixes;
  - Qloo socials, with Wikidata as a fallback;
  - marking S20 as passed.
- **P1 features not built:**
  - F28: mood board;
  - F29: MCP server;
  - F30: score a list.
- **[VERIFY] markers:** 19 remain in the PRD.
- **Deploy:** Cloud Run, following `docs/DEPLOY.md`, once the reworks land.
- **Before submission:** make the repo public.

## How we work

- **GitHub:** private repo at `siddh8nt/athena`. `main` is the working v0; each big change goes on its own branch and in through a PR.
- **Secrets:** they live only in `.env`, which is never committed. Never commit `.cache/` either (raw Qloo responses).
- **Ask first:** PRD changes, commits, pushes, making the repo public and deploys all need an explicit OK.
- **Cost:** zero spend beyond the $300 GCP credit.
- **The UI never shows "failed" or "not found" and never hangs.** Slow steps are narrated.
- **Qloo stays central but understated:** quiet method lines and call counts, no slogans or badges.
- **Every feature must work live for any consumer brand.** The demo cache is only a speed-up.
