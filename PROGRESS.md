# Athena progress

Last updated: 28 Oct 2026. This file is a summary for the team.

- **Source of truth:** `ATHENA PRD.md` v5.0, §23. §23.2 is the build order.
- **Next build:** `HANDOFF.md`.

## What Athena is

Athena is a taste-led growth agent for consumer brands, built for the Qloo hackathon. Submission is 28 Oct.

**How it works:**
1. A founder tells Athena about their brand: a website, files, pasted notes, or a summary from their AI assistant.
2. Athena builds a Brand Knowledge Base and a Brand Graph.
3. Athena ranks the crowds most likely to love the brand, using Qloo's taste data.
4. Athena leads six subagents toward the founder's goals:
   - the Analyst;
   - the Scout;
   - the Navigator;
   - the Rep;
   - the Matchmaker;
   - the Promoter.
5. The Executive turns the team's work into **Execute Plan**: every item in order, contacts for Now, and drafts to send.

**Stack:**
- Next.js 16, React 19 and TypeScript;
- Gemini on Vertex;
- the Qloo hackathon API, with two keys;
- Cloud Run and Firestore, paid from the $300 GCP credit.

## Where it stands

| §23.2 step | State |
|---|---|
| 1–8.6, including §23.5 (a)–(r) | Built and verified live, on `complete-rework`. |
| 8.7 Athena in the founder's own tools (§23.6) | Built, pushed and deployed. |
| 8.8 Dev mode out of the founder's UI, and a polish pass (§23.7) | Built, pushed and deployed. |
| 9 The context test | Not started. |
| 10 QA, deploy and write-up | Not started. |

**Checks:** tsc is clean, and vitest passes 699/699.

**What has gone where:**
- `complete-rework` is at `bcfddb2` and pushed to GitHub.
- `main` is untouched.
- The Cloud Run preview is on revision `athena-00005-qsn`: the `bcfddb2` build, with Flash on `gemini-3.5-flash` as locally.

## How we work

The rules in full are in `HANDOFF.md` §3. In short:

- **The founder approves first:** PRD edits, commits, pushes, deploys and making the repo public each need a plain yes.
- **Commits** carry no Claude attribution.
- **Data:**
  - secrets live only in `.env`;
  - no Qloo data in the repo;
  - `.cache/` is never committed.
- **No failure states in the UI.** Nothing hangs, and slow work is narrated.
- **Real agent, not a demo:** everything works live for any consumer brand.
- **Fixes are agent reasoning, not keyword rules:** give the model context, never regexes or word lists.
- **Naming:** only Athena is an agent, and the six are subagents. The end output is Execute Plan.
