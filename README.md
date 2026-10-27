# Athena

**The taste-led growth agent for consumer startups.** Athena finds your next stockists, cities and partners from what your customers already love, using Qloo's taste graph.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). The product spec is in [`ATHENA PRD.md`](ATHENA%20PRD.md).

> Status: PRD v5.0 §23 is built through step 8.6 on the `complete-rework` branch. Steps 8.7 and 8.8 are specced but not built. See [`PROGRESS.md`](PROGRESS.md) and [`HANDOFF.md`](HANDOFF.md).

## Setup

Requires Node.js 22.19 or later.

```bash
corepack pnpm install
cp .env.example .env      # add your Qloo hackathon key; leave it blank to run on fixtures
corepack pnpm dev         # http://localhost:3000
corepack pnpm test
```

Without a `QLOO_API_KEY`, or with `ATHENA_FIXTURES=1`, the app serves synthetic data labelled FIXTURE.

## Layout

```
app/            pages and API routes (/health)
lib/qloo        Qloo client, parameter builder, cache, rank utilities
lib/playbook    categories, tiers, stages, recipes
lib/blocks      markets, places, partners, act
lib/methods     resolve, fingerprint, rerank, bridges, mutual fit
lib/agent       tools, prompts, validator, event log
lib/proof       backtest runner and metrics
fixtures/       synthetic data (FIXTURE)
proof/          stockist lists (public business data) and registration
docs/           method, Qloo usage, design
tests/          unit and end-to-end tests
```

## Data rules

- Only the server calls Qloo. The key lives in `.env` and never reaches the repo, the browser, logs or the trace.
- No Qloo response data is committed.

## License

MIT
