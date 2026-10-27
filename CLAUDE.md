# Working on Athena

## After every context compaction: realign before acting

A compaction summary is a lossy copy of the plan. Before the first tool call that changes anything, rebuild the plan from its sources:

1. **Re-read the plan.** The plan is **PRD v5.0**, nothing older: `PLAN v4.md` is a superseded draft, never build from it. Read `ATHENA PRD.md` §23 in full: §23.1 holds the founder's problems verbatim, and §23.2 holds the build order with each step's spec and "done when". Where §23 conflicts with earlier sections, §23 wins.
2. **Re-read the memory index** (`MEMORY.md`) and the build-status memory (`build-status.md`; its last entry is the current state). They give the current step and the standing rules. If this account can't see them, `HANDOFF.md` §2–3 gives the same state and rules.
3. **Locate yourself exactly.** Name:
   - the §23.2 step in progress;
   - which parts of its spec (a, b, c…) are built, tested, and verified live;
   - which "done when" checks are still unmet.

   Confirm this against the code (`git status`, the files the summary names), not the summary alone.
4. **Recover the last action.** Take the summary's "current work" and "next step", plus any verbatim messages that follow it. If they disagree, the verbatim messages win. If a step was interrupted (a live run, a test, an edit), check its result on disk before re-running it.
5. **Re-apply the standing constraints.** Read them from memory before acting:
   - ask before PRD edits, commits and pushes;
   - no invented dates;
   - no failure states in the UI;
   - agent reasoning, not keyword rules;
   - Bench integrity;
   - secrets only in `.env`;
   - no Qloo data in the repo.
6. **Then continue** the same step from where it stopped. Don't restart finished work, skip ahead to a later step, or start new scope the founder hasn't asked for.

When a step's "done when" is fully met:
- update `build-status.md`;
- report to the founder;
- ask before committing.
