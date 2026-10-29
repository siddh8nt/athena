# Athena

**The taste-led growth agent for consumer brands.**

Most AI knows only what's been written about a brand. Athena reads what millions of people love, across food, music, places, shows and brands, through Qloo's taste graph. From that it finds the crowds already wired to love a brand, then puts the brand in their path: the cities, shelves, partners and moments to go after, in order, with the outreach drafted.

Meta gave brands lookalike audiences. Athena gives them lookalike places, partners and moments.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). The product spec is in [`ATHENA PRD.md`](ATHENA%20PRD.md).

## What it does

- **Reads the brand.** The founder's site, decks and spreadsheets become one Brand Graph. Every fact keeps its source, and the founder can edit any of it.
- **Ranks who to win.** The Analyst measures the crowds who share the brand's customers' taste and ranks them: win first, win next, watch. Athena ranks; the founder never has to judge taste.
- **Works the founder's goals as a team.** Athena is the agent. She hands each goal to the subagents it needs (Scout, Navigator, Rep, Matchmaker, Promoter), and each one calls tools in a loop, choosing its next call from what the last one returned. When a crowd looks soft, the Analyst measures more brands against it before it ranks.
- **Does the work, not just the research.** The Executive turns Athena's plan into Execute Plan: every step in order, published contacts for what's due now, and an email, a DM and a call script to copy. Nothing is sent for the founder.
- **Travels.** Connect with Athena MCP gives any MCP client the brand's live workspace, so the founder's own AI tools know their crowd too. The plan also goes out as a spreadsheet, a calendar feed, a view-only page for the team and a Markdown file any LLM can read.

Every answer shows where it came from: the tool calls behind it and how many Qloo calls they took.

## Status

PRD v5.0 §23 is built through step 8.11 on the `complete-rework` branch. A preview runs on Cloud Run at https://athena-610996920841.us-central1.run.app. See [`PROGRESS.md`](PROGRESS.md) and [`HANDOFF.md`](HANDOFF.md).

## Setup

Requires Node.js 22.19 or later.

```bash
corepack pnpm install
cp .env.example .env      # add your Qloo hackathon key; leave it blank to run on fixtures
corepack pnpm dev         # http://localhost:3000
corepack pnpm test
```

Without a `QLOO_API_KEY`, or with `ATHENA_FIXTURES=1`, the app serves synthetic data labelled FIXTURE. `node scripts/dev-free.mjs` runs a second server on port 3001 with Qloo fixtures and no model or paid APIs, so testing there spends nothing.

## Layout

```
app/            pages and API routes
components/     the dashboard, subagent pages, Execute Plan, chat and landing
lib/agent       Athena, the subagents, their tools and the agent loop
lib/qloo        Qloo client, parameter builder, cache, key rotation
lib/taste       crowd measurement and the taste galaxy
lib/workspace   saved workspaces, share links and the MCP server
lib/bench       the Taste Bench
fixtures/       synthetic data (FIXTURE)
proof/          stockist lists (public business data)
docs/           deployment
tests/          unit and end-to-end tests
```

## Data rules

- Only the server calls Qloo. The key lives in `.env` and never reaches the repo, the browser, logs or the trace.
- No Qloo response data is committed.

## License

MIT
