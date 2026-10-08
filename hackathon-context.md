# Qloo Agentic Hackathon — Full Project Context

Handoff document for continuing in Claude Code. Contains the hackathon rules, the official starter kit and the complete Qloo API reference (from docs.qloo.com, studied Oct 6–7 2026). The product being built is Athena; ATHENA PRD.md is the source of truth and wins wherever this file disagrees with it.

## Table of contents

- Part 1 — The hackathon (rules, dates, judges, judging, submission)
- Part 2 — Official hackathon kit (@qloo/qloo-harness, MCP tools)
- Part 3 — Qloo API reference (endpoints, parameters, entity types, schemas, tags, recipes, gotchas)

# Part 1 — The hackathon

## 1.1 Basics

- Name: Qloo Agentic Hackathon — "Agents, but with taste."
- Site: https://qloo.devpost.com/ (pages: Overview, Resources, Rules, Project gallery, Updates, Discussions, Participants, Schedule)
- Format: online, public. Open to people above the age of majority in their country; standard exclusions (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, OFAC-sanctioned countries; Qloo/Devpost employees and families; judges and their employers).
- Sponsor: Qloo, 100 Crosby Street, New York, NY 10012.
- Participants: ~626 as of Oct 7 2026; ~495 working solo, 70 with a team, 21 looking for teammates. Mostly full-stack devs (297), data scientists (59); top skills: python (291), javascript (149), react (111), ai (87), typescript (71).
- Team: Siddhant and Jaiaditya (both must be on the Devpost project team before submitting).

## 1.2 Dates (IST / GMT+5:30)

| Period | Start | End |
|---|---|---|
| Submissions | Sep 30 2026, 7:00 PM | Oct 31 2026, 9:15 AM (= Oct 30, 11:45 PM ET) |
| Judging | Nov 2 2026, 10:30 PM | Nov 17 2026, 10:15 AM |
| Winners announced | Nov 24 2026, 1:30 AM | |

## 1.3 Prizes

- 1st: $15,000 cash · 2nd: $6,000 · 3rd: $4,000 (total $25,000). Each project can win only one prize.
- BONUS: Jason Calacanis will personally invest an additional $25,000 in his favorite entry (separate from prizes).

## 1.4 Challenge text (verbatim highlights)

> Agents are getting smarter, but they're culturally blind. They can reason, plan, and execute — but ask them what to recommend, what to build, or what people actually want, and they're guessing. This hackathon is about fixing that. Build an agentic tool, an agent-powered app, or wire Qloo into an agent that already exists. Use our API and taste graph — 250M+ entities across music, film, dining, fashion, and more — to give your agent something most never get: real cultural grounding.
>
> We're not looking for demos of what LLMs can already do. We're looking for the thing that only works because it knows what people love. Show us the use case where cultural intelligence is the difference between "technically functional" and "actually good."

What to build: a working software application that integrates the Qloo API and either (a) functions as an agentic tool, (b) is built using an agent framework, or (c) wires Qloo into an agent you already have. Cultural intelligence must be the differentiator: the agent should outperform generic LLM-only approaches because it has access to Qloo. "If your submission would work the same without Qloo, you're building the wrong thing."

Qloo's own lateral examples:
- An agent that helps electricians' customers choose lighting styles for specific rooms (mood, comfort, function, personal taste).
- An agent recommending meals/dining for seniors matching taste plus age-specific needs (easy-to-chew, low-heat delivery, medication-aware ingredients).
- An agent supporting people in rare-disease journeys (information + community + next steps matched to what they need emotionally and practically).

## 1.5 What to submit

1. Link to a functional demo app — live, working, end-to-end.
2. Public code repo (GitHub/GitLab/Bitbucket) with all source, assets, run instructions.
3. Text description of features and what makes it "Qloo-powered".
4. Externally hosted / fully published (live website/web app, hosted APK/TestFlight). Local-only or private-access submissions don't qualify.
5. Open-source license visible in the repo's About section.

- Demo videos are NOT required ("we're requiring something judges can actually use"). Judges may still judge from description/images only.
- Existing projects allowed only if significantly updated with Qloo during the submission period (explain how).
- Multiple submissions allowed if substantially different.
- Must remain free to test until judging ends; if private, give login credentials.

## 1.6 Judges

- Jason Calacanis — entrepreneur & angel investor ("Bestie")
- Mike Diolosa — CTO, Qloo
- Nicole Seligman — OpenAI Board of Directors
- Todd Boehly — Co-founder/Chairman/CEO, Eldridge Industries
- Cedric the Entertainer — actor, comedian, producer, TV host
- Michael Abrams — EVP Strategic Initiatives, Live Nation Entertainment

→ Investor / media / entertainment-heavy panel. Business-credible pitches resonate.

## 1.7 Judging

- Stage 1: pass/fail — fits theme and reasonably uses Qloo API.
- Stage 2: four equally weighted criteria:
  - Technological Implementation: How thoroughly and skillfully does the project use Qloo? Genuine effort, working, non-trivial implementation?
  - Design: Complete, coherent product experience, not just a technical proof of concept?
  - Potential Impact: Credible, specific case for solving a real problem for a real audience, and does the demo actually address it?
  - Quality of the Idea: Creative, non-obvious use of Qloo; genuine understanding of the problem space?
- Tie-break: compare scores criterion by criterion in that order.
- Sponsor may use expert panels, peer review, or automated AI-driven analysis.

## 1.8 Discussions / updates (as of Oct 7)

- Updates page: no announcements yet.
- Forum: two threads about API key delays (keys issued manually; manager Ian Cook: "sending these out as we get the chance to address the massive amount of requests"). One unanswered question: "Are sports teams searchable entities, and under which type?"
- Project gallery not yet published.
- Discord: https://discord.gg/rF9PKsD5Q7 (#api-help). Manager email: ian@qloo.com.

## 1.9 Last year (2025 Qloo LLM Hackathon) — for differentiation

Winners: GeoTaste (location → business consultant agent with market analysis + visualizations), Resonance AI (culturally authentic political campaign messaging), Zesty (the "unrecommendation" engine), Alloy (cultural due-diligence engine with a Cultural Compatibility Score for M&A/deals). Other entries: Culturo, Qlue, Sustainable Lifestyle Assistant, Voya (astrology travel), TAVA (Taste-Aware Venture Architect), QlooMoodFlix, Qlootra (travel), MyNakama, Product Discovery & Market Insights Platform, CultureAI ("Cultural DNA"), PersonaReads, Taste Taylor (fashion), RescueEye, Vybr (roommates), Duddle (group decisions), TasteJourney, Marketly (marketing campaigns), Taste Mirror, Lokalo. 344 projects total. → Overdone: travel planners, movie-mood recs, "cultural DNA" profiles, generic market research.

# Part 2 — Official hackathon kit

Repo: https://github.com/qloo/qloo-hackathon-kit (linked from Devpost Resources page).

## 2.1 The harness

- npm package @qloo/qloo-harness (≥ 0.1.26, published 2026-09-23; "Qloo-focused terminal agent built on the Pi SDK"). Requires Node.js ≥ 22.19.0.
- Install: `npm install --global @qloo/qloo-harness` → `qloo --version` → `qloo setup --qloo` (enter key; stored privately) → `qloo setup --status`.
- Four supported surfaces (all share the same credential and quota):

| Surface | Use | Needs |
|---|---|---|
| `qloo explore` | Chat agent; ask Qloo questions in plain language. Commands: /journey insight, /request, /why, /sources, /trace, /raw, /status, /next, /doctor, /retry, /start, /matches | Model provider sign-in: `qloo setup --model` |
| `qloo exec <workflow>` | Run validated workflows from scripts/backends, JSON out (--input-file, --jsonl) | Nothing else |
| `qloo api <endpoint>` | Raw endpoint calls, e.g. `qloo api search --query "Agatha Christie" --type book --take 3 --json`; --dry-run; `qloo api --help` | Nothing else |
| `qloo mcp` | Local stdio MCP server (no hosted URL) for MCP clients or your app's model | MCP client or backend that spawns a process |

- integrate, plan, build modes are NOT part of the hackathon.
- Don't use --api-key flag (shell history); use `qloo setup --qloo` or QLOO_API_KEY env var.

## 2.2 MCP tools (from `qloo mcp`)

| Tool | What it does |
|---|---|
| qloo_capabilities | Versioned workflow catalog + readiness; no network call |
| qloo_find_tags | Search Qloo's tag ontology by natural-language concept → stable tag URNs (limit 1–20) |
| qloo_describe | Resolve one named entity or UUID; return only metadata present in Qloo |
| qloo_recommend | Find entities related to one combined entity/tag/location/demographic taste profile (signals, target_type); signals influence affinity, filters constrain output |
| qloo_rank | Rank a supplied option set (options, option_type) against one shared profile (signals or demographic). Scores from separate calls are NOT comparable |
| qloo_where_popular | Find geographic areas where one entity has strong affinity (entity, within) — distinct from filtering recs to a place |
| qloo_compare_audiences | Compare two groups of entity signals (group_a, group_b) |
| qloo_audience_demographics | Aggregate demographic distributions for one entity (urn:demographics) |
| qloo_entity_tags | Concepts that jointly characterize one or more entities (urn:tag insights) |
| qloo_trends | Time-series popularity for 1–5 entities over an ISO date range (entity_type) |
| also internally: qloo_search, qloo_entity, qloo_insights, qloo_analyze, qloo_tags | |

- Demographic input can be natural language: "young women", "men 25-34", "millennials" → converted to Qloo demographic signals.
- Typical chain: qloo_find_tags / qloo_describe → confirm with user → qloo_recommend / qloo_rank / qloo_where_popular.
- Result envelope (all tools): `{ status, summary, results, result_count, error? }`, statuses:
  - ok ready · empty no match (refine) · needs_input ambiguous (show candidates, ask user) · partial · degraded (fallback/reduced quality) · error (error.code, error.retryable, error.recovery; e.g. QLOO_AUTH). Retry only if retryable.
- MCP client config: `{ "mcpServers": { "qloo": { "command": "qloo", "args": ["mcp"] } } }` (use full path from `where.exe qloo` on Windows if the client can't find it). Use `qloo mcp`, not legacy `qloo api mcp`.
- Backend starter (starter/mcp-client/backend.mjs): uses @modelcontextprotocol/sdk 1.30.1, `StdioClientTransport({ command: "qloo", args: ["mcp"], env: process.env })` — must pass `env: process.env` or QLOO_API_KEY isn't forwarded. Python: mcp package stdio client with same command/args.

## 2.3 Kit rules & guidance

- Deploy: backend on a VM/container with Node ≥ 22.19, harness installed, QLOO_API_KEY as secret. Front end calls your backend, never Qloo. A browser can't start `qloo mcp`; serverless functions are not a supported route (direct REST calls from your own server are still fine).
- Keys: never in repo, browser bundle, public MCP config, demo recording. .env.example placeholder only.
- Usage: smallest request that answers the question; cache only what's needed; bounded retries; no bulk scraping or recreating a database.
- Safe use: Qloo results are aggregate cultural affinities — not evidence of a person's identity, preferences or future behavior. Don't infer identity, sensitive traits, health, financial status, political views, or eligibility (housing, employment, credit, insurance). Don't send names, emails, device IDs, account IDs, location histories or other personal data. Distinguish Qloo results from your interpretation; don't present affinity as causal or individual probability. Ask for clarification when an entity/tag choice would materially change a result. (Note: this sits awkwardly with Qloo's own health examples — keep any health logic outside Qloo.)
- Kit submission guide suggests: short problem statement; which Qloo workflows/MCP tools and why; a redacted request→result explanation incl. entity/tag choices; screenshots without credentials/personal data; setup steps from a clean environment; known limitations. Judges value usefulness, technical execution, provenance & user clarity, responsible data handling, reproducibility. Use Qloo results as evidence in a clear product flow, not isolated API responses.
- Troubleshooting: `qloo setup --status --json`, `qloo doctor`, `qloo doctor --network`. QLOO_AUTH = no usable credential. Support: GitHub Discussions Q&A on the kit repo; private matters → ian@qloo.com.

# Part 3 — Qloo API reference

Source: docs.qloo.com — API Reference, Guides, API Examples (recipes). All sidebar pages and all 22 recipes were read.

## 3.1 Access & basics

- Hackathon base URL: https://hackathon.api.qloo.com — hackathon keys only work here. Staging (staging.api.qloo.com) and production (api.qloo.com) return 401. Every doc example uses those URLs — replace the base.
- Auth: header `X-Api-Key: <key>`. Not Bearer, not query param ("No API key found in request" otherwise).
- Key: request via form linked in the Developer Guide; issued manually by email in a few business days (check spam). Valid through end of judging, then deactivated. Quota/rate limits "high enough"; ask in Discord #api-help for more.
- **Our key: received Oct 8 2026** (email from hackathon@qloo.com to Siddhant). Stored only in `.env` as `QLOO_API_KEY` (git-ignored); never copy it anywhere else. Developer guide: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
- RESTful JSON. All documented endpoints available during the hackathon. Do NOT use /recommendations or /recs (legacy, unsupported).
- Base URL alone isn't an endpoint (404). Don't merge paths (/v2/insights/search is invalid).
- GET / returns API info (version, deployment date, contact).
- Can't filter response fields — full response always returned (verbose akas etc.); extract client-side.
- Caching: private server-side caching OK, no time limit. Never store Qloo response data in a public repo.
- "Taste Analysis" = a way of using Insights (formerly "Taste AI").

## 3.2 Endpoints

| Endpoint | Purpose |
|---|---|
| GET /v2/insights | Core engine: recommendations, demographics, heatmaps, taste analysis (tags). Mode set by filter.type. |
| GET /search | Search entities by name/property |
| GET /entities | Get entities by Qloo IDs or external IDs |
| GET /v2/tags | Search tags (for filter.tags, filter.exclude.tags, signal.interests.tags) |
| GET /v2/tags/types | Tag types supported per entity type |
| GET /v2/audiences | Audience IDs for signal.demographics.audiences (marked DEPRECATED in docs, still used in recipes) |
| GET /v2/audiences/types | Audience type IDs (DEPRECATED) |
| GET /v2/analysis/compare | Compare two groups of entities → shared tags |
| GET /v2/trending | Time-series popularity trends |
| GET / | API information |

### /search
- query (string) — text to search.
- types (array) — categories. Legacy types available for search only (not in insights): urn:entity:actor, urn:entity:album, urn:entity:author, urn:entity:director, urn:entity:locality, … (12 enum values; full list not expanded).
- filter.location — lat,lon pair, WKT, or Qloo UUID. filter.radius — miles, 0–100, default 10.
- filter.exists (e.g. external.resy, external.michelin), filter.tags, operator.filter.tags (union default/intersection), filter.rating (0–5 min), filter.popularity (0–1 min), filter.address (partial match).
- page (1–100), take, sort_by = match (default) | distance | popularity.
- Responses: 200, 404 no results, 429 rate limit. Results are a flat array under results (each: name, entity_id, types, properties, popularity). Works for autocomplete.

### /entities
- entity_ids (UUID array), and external ID lookups: external.facebook.ids, external.goodreads.ids, external.goodreads_author.ids, external.igdb.ids, external.imdb.ids, external.instagram.ids, external.isbn10.ids, external.isbn13.ids, external.itunes.ids, external.lastfm.ids, external.library_of_congress.ids, external.metacritic.ids, external.michelin.ids, external.musicbrainz.ids, external.rottentomatoes.ids, external.soundcloud.ids, external.spotify.ids, external.tablet.ids, external.twitch.ids, external.twitter.ids, external.wikidata.ids, external.resy.ids.
- Pattern: external.<namespace>.ids. Results flat array. Example: GET /entities/?external.spotify.ids=74KM79TiuVKeVCqs8QtB0B&take=1.

### /v2/tags
- filter.query (partial string), feature.typo_tolerance (bool, default false), feature.semantic_search (bool, beta — semantic similarity matching), filter.results.tags, filter.parents.types, filter.popularity.min/max, filter.tag.types (exact match; get list from /v2/tags/types), page, take (1–50, default 20).
- Response: results.tags[] with id (URN to use), name, type, parents[].type (entity scope). One keyword can return multiple tag types — pick the one matching what you filter. Example: filter.query=rooftop bar&take=3.
- No static full tag list exists — always search.

### /v2/tags/types
- filter.parents.types, page, take.

### /v2/audiences (+ /types)
- filter.parents.types (audience parents: urn:audience:communities, global_issues, hobbies_and_interests, investing_interests, leisure, life_stage, lifestyle_preferences_beliefs, political_preferences, professional_area, spending_habits), filter.results.audiences, filter.audience.types, filter.query, filter.popularity.min/max, page, take.
- Response results.audiences[] with URN id (e.g. urn:audience:hobbies_and_interests:outdoors), entity_id (UUID), name, type, parents[]. Pass the URN, not the UUID, to signal.demographics.audiences.
- Audiences = curated groups formed by aggregating positive signals (follows, likes, shares), e.g. "LGBTQ" under Communities, "Vintage Apparel" under Spending Habits.

### /v2/analysis/compare
- Required: a.signal.interests.entities, b.signal.interests.entities. Each side accepts the full insights parameter set with a./b. prefix.
- Optional: filter.type (array), filter.entities.query, filter.exclude.entities.query (POST), filter.location.query, filter.location.radius, filter.exclude.location.query, filter.exclude.location.radius, filter.subtype (urn:tag:genre | urn:tag:occupation), model (descriptive default | predictive), page, take, offset.
- Always returns tags, never entities. Response top-level keys only duration and results (no success field). results.tags[]: tag_id, name, type, subtype, popularity, query.score (how strongly both audiences index for it).
- Example: Lululemon vs Patagonia → shared tags like urn:tag:style:qloo:athletic score 0.729.

### /v2/trending
- Required: filter.type, filter.start_date, filter.end_date (YYYY-MM-DD). Optional: signal.interests.entities, take, offset, page.
- Returns weekly stats: population percentile, rank, velocity, acceleration; ordered by date desc.
- Two uses: (1) time series for specific entities; (2) rank a type by trend velocity (rising fastest within window vs prior period — not overall popularity). 7-day window most common. Works for any entity type. Example: filter.type=urn:entity:artist&filter.start_date=2026-05-05&filter.end_date=2026-05-12&take=10.

## 3.3 /v2/insights — modes (filter.type)

Required on every call. Plus at least one valid filter or signal.

Entity types (recommendations): urn:entity:artist, book, brand, destination, locality, movie, person, place, podcast, tv_show, videogame. ⚠️ Docs conflict: Developer Guide lists urn:entity:destination and urn:entity:video_game; Deep Dive lists urn:entity:videogame and urn:entity:locality. Test both. 403 "You do not have permission to access urn:entity:…" = unsupported type. Music = artist (not music); food places = place or brand (not food_and_drink). urn:entity:audience deprecated. Deprecated person subtypes: actor, author, director → use person.

Other modes:
- urn:demographics — demographic breakdown (age/gender) for signal.interests.entities and/or signal.interests.tags.
- urn:heatmap — geospatial affinity grid.
- urn:tag — taste analysis (tags that describe a signal).

### Mode: Recommendations
- Returns results.entities[] ranked by affinity: name, entity_id, type, subtype, properties (type-specific), popularity, tags[], query (e.g. affinity, measurements.audience_growth, distance if location filter), disambiguation, external (instagram, wikidata, twitter, letterboxd, metacritic ratings, rottentomatoes ratings, imdb rating+count…).
- Signal entities and result entities don't need to be the same type (cross-domain). Location of signal doesn't need to match filter location (a Brooklyn restaurant can drive Paris recs).
- Multiple signal entities → results ranked by combined affinity across the set.

### Mode: Demographics (urn:demographics)
- Required: one of signal.interests.entities, signal.interests.tags (both allowed to compare).
- Response results.demographics[]: per entity/tag, query.age {24_and_younger, 25_to_29, 30_to_34, 35_to_44, 45_to_54, 55_and_older} and query.gender {male, female}; positive = above-average affinity, negative = below.
- Example: action genre → 25–29: 0.43, 45–54: −0.28, male 0.08. Charlize Theron → 30–34: 0.70.

### Mode: Heatmap (urn:heatmap)
- Required: one location param (filter.location.query or filter.location) + at least one signal (signal.interests.entities or signal.interests.tags).
- Optional: bias.trends, output.heatmap.boundary (geohash default | city | neighborhood), signal.demographics.age/gender/audiences(.weight), heatmap.dimensions (quality, popularity, hotel_class, price_level — only with geohash boundary; adds <dim>_affinity_rank and <dim>_affinity), filter.dimensions.hotel_class / filter.dimensions.price_level (arrays; require that dimension; add *_count_affinity(_rank)), take.
- Response results.heatmap[]: location {latitude, longitude, geohash}, query {affinity, affinity_rank, popularity}. Also query.localities.filter with matched locality entity.
- affinity: normalized interest vs other entities in that location (local + global). popularity: percentile signal density in that geohash. affinity_rank: how the entity performs vs itself across locations (where it over/under-performs).
- Geohash tiles: 7 precision levels, ~118 m to ~625 km wide; dynamic density discovery (high precision in cities, coarser in rural areas).

### Mode: Taste analysis (urn:tag)
- Required: one of signal.interests.entities, signal.interests.tags, signal.demographics.audiences, signal.location/.query, filter.tag.types, filter.parents.types.
- filter.tag.types scopes to a tag namespace (e.g. urn:tag:keyword:media, urn:tag:ambience:qloo). Without it, results span all tag types.
- Response results.tags[]: tag_id, name, types, subtype, tag_value, query (incl. affinity — how strongly the tag applies to the signal audience).
- Use cases: psychographic profiling, persona generation, what makes a brand/place resonate. Supports diversify.by=subtype + diversify.take (cap per tag subtype).

## 3.4 /v2/insights parameters (complete)

### Signals (what drives ranking)
- signal.interests.entities — comma-separated entity IDs (any categories). .weight (≥0).
- signal.interests.entities.query — POST only (JSON body): array of {name, address} objects (or plain strings for fuzzier); supports resolve_to (place, brand, or both). Lets you pass raw transaction-like data ("Nobu, 105 Hudson St").
- signal.interests.entities.include — force extra entity IDs to contribute.
- signal.interests.tags — tag IDs. GET: comma-separated. POST: array of { "tag": "...", "weight": 20 } (relative weights > 0). Recipe also shows signal.interests.tags.weights=20,7 (parallel list). operator.signal.interests.tags union (highest-affinity tag scores) | intersection/empty (must contain all, merged). .weight.
- signal.demographics.age — 35_and_younger, 36_to_55, 55_and_older, 24_and_younger, 25_to_29, 30_to_34, 35_to_44, 45_to_54. .weight.
- signal.demographics.gender — male | female. .weight.
- signal.demographics.audiences — audience URNs. .weight.
- signal.location — WKT POINT/POLYGON or locality Qloo ID (lon first). signal.location.radius (≤800000 m; generally avoid — overrides dynamic density discovery; ignored for ID/polygon). signal.location.query — fuzzy locality name ("The Big Apple"); 400 if none found. signal.location.weight.
- bias.trends — off, very_low, low, mid, medium (default), high, very_high.
- bias.content_based — 0–1 (default 0.5), weight of content/metadata similarity.
- bias.quality — places only; number or weight string; filters out places without quality score.

### Filters (what comes back)
- Generic (most types): filter.tags + operator.filter.tags (union default | intersection); filter.exclude.tags + operator.filter.exclude.tags/operator.exclude.tags; filter.exclude.entities (IDs); filter.exclude.entities.query (POST; {name,address}; 400 if none; response query.entities.exclude); filter.results.entities (score only these IDs — "assess affinity of an entity towards input"); filter.results.entities.query (names; GET single, POST array); filter.results.tags; filter.entities.query; filter.parents.types; filter.popularity.min/max (0–1 percentile); filter.external.exists (resy, michelin, tablet) + operator.filter.external.exists; filter.exists (properties.image, properties.description).
- Location (place, destination, heatmap): filter.location (lat,lon / WKT / locality ID); filter.location.query (fuzzy locality name; POST array merges multiple localities; single → query.locality.signal in response; 400 if none); filter.location.radius (m, ≤800000, default 15000; when locality given without radius, boundary padded by min(10% diameter, 2414 m); 0 = strictly inside); filter.location.geohash (prefix match, pygeohash precision 12); filter.exclude.location, filter.exclude.location.query, filter.exclude.location.radius, filter.exclude.location.geohash; filter.geocode.name (city), .admin1_region (state), .admin2_region (county/borough), .country_code (2-letter) — exact match; filter.location.metro; filter.address (partial match).
- Places: filter.price_level.min/max (1–4); filter.price_range.from/to (hotel price, 0–1,000,000); filter.hotel_class.min/max (1–5); filter.hours (day open: monday…sunday); filter.properties.business_rating.min/max (1–5); filter.rating.min/max (Qloo rating 0–5); filter.external.tripadvisor.rating.min/max, .rating.count.min/max; filter.external.resy.rating.min/max, .count.min/max, .party_size.min/max; filter.references_brand (only places of given brand IDs, e.g. Walmart stores) + operator.
- Movies/TV: filter.content_rating (G, PG, PG-13, R, NC-17, TV-G, TV-PG, TV-14, TV-MA, TV-Y, TV-Y7, TV-Y7-FV, Not Rated, Unrated, Approved, Passed, X, GP, M, 13+, 16+, 18+); filter.release_year.min/max; filter.release_date.min/max; filter.release_country + operator; filter.rating.min/max; TV only: filter.finale_year.min/max, filter.latest_known_year.min/max.
- Books: filter.publication_year.min/max.
- People: filter.date_of_birth.min/max, filter.date_of_death.min/max, filter.gender.
- Tags mode: filter.tag.types.

### Output controls
- take 1–50 (default 20), page 1–100 (recommended pagination), offset.
- sort_by — affinity | distance (needs filter.location) | rating | quality (places).
- diversify.by — properties.geocode.city | properties.geocode.metro | subtype (tags only); diversify.take (max per group). Set take ≥ groups × diversify.take. Groups ranked by best entity.
- backfill.cross_domain.take (1–20, default 20), backfill.content_based.take (1–10, default 10) — pad results when primary signals are insufficient.
- feature.explainability=true — per result query.explainability showing which input entities contributed (normalized 0–1; ≥0.1 always included) + top-level aggregate impact across top-N subsets (top 3/5/10/all). Warning under query.explainability.warning if not computable.
- output.heatmap.boundary, heatmap.dimensions (heatmap mode).

## 3.5 Entity Type Parameter Guide (which params are valid per type)

Invalid params are silently ignored → empty 200 often means a param isn't valid for that type.

- Artist, Book, Brand, Movie, Person, Podcast, TV Show, Video Game: filter.type, bias.trends, filter.exclude.entities, filter.parents.types, filter.popularity.min/max, filter.exclude.tags + operator, filter.external.exists + operator, filter.results.entities(.query), filter.tags + operator, offset, signal.demographics.age/audiences/audiences.weight/gender, signal.interests.entities, signal.interests.tags, take. Plus type-specific: Book publication_year; Movie content_rating, release_year, release_country, rating; Person date_of_birth/death, gender; TV content_rating, finale_year, latest_known_year, release_year, release_country, rating.
- Destination: above + filter.geocode.*, filter.location, .radius, .geohash, filter.exclude.location.geohash. signal.interests.entities is REQUIRED.
- Place: all generic + bias.quality, filter.address, Tripadvisor/Resy filters, filter.geocode.*, hotel class, hours, location filters, price level/range, business rating, filter.references_brand, sort_by.
- Heatmap: filter.location, .query, .radius, heatmap.dimensions, filter.dimensions.*, output.heatmap.boundary, signal.demographics.age/audiences/gender, signal.interests.entities/tags, take.
- Tag: filter.type, diversify.by, diversify.take, offset, take (plus signals/filters per Taste Analysis page).

## 3.6 Scores & methodology

- Affinity 0–1. Meaning varies by use case:
  - Recommendations: similarity (cosine similarity of embeddings).
  - Location: how relevant an entity is to a place vs others there and globally.
  - Taste analysis: relevance of tags to a "taste vector".
- Ranges: >0.8 very high · 0.6–0.8 high · 0.5 medium · <0.5 low. Scores drop as more inputs/filters are added (0.55 can still be strong). Small differences (0.91 vs 0.92) ≈ same; compare by rank/index. Scores are normalized per query — don't compare raw scores across queries.
- Popularity — percentile of signal vs all entities in the same domain.
- audience_growth — rising/falling audience signal.
- Cross-category: all entity categories trained into one shared embedding space → brand↔restaurant, artist↔destination, TV show↔fashion affinities. Qloo's core edge over LLMs.
- Data sources: proprietary first-party (TasteDive API ecosystem cross-domain panel), third party, proprietary entity database (millions of properties), API ecosystem learning rights (Fortune 500 anonymized transactions, JCDecaux, Michelin, Samsung, Netflix, etc.), OpenStreetMap. Updated daily/weekly/monthly by category. Signals = weighted interactions (transactions, reviews ±, likes, streams, comments, posts, list inclusions); bot detection applied.
- No cold start: a single lat/lon, or just demographics, produces results. No PII required or used.
- Signal arrays: multi-location inference (entities sharing arrays inherit location associations).
- Learning rights: unless otherwise agreed, Qloo may learn from anonymized entity arrays passed through the API.
- Filters with multiple attributes are OR by default.

## 3.7 Schema & taxonomy (fields and tags by entity type)

Books — tags flat, urn:tag:genre:media:* (action, adult, american_history, audiobook, banned_books, biography, biography_memoir, business, childrens, classic_literature, classics, coming_age, crime, drama, dystopia, fantasy, fiction, finance, high_school, historical, historical_fiction, history, law, literary_fiction, medical, memoir, military_history, mystery, nonfiction, novels, philosophy, politics, psychology, read_school, romance, school, science, sociology, sports, theatre, true_crime, true_story, war, young_adult). Fields: name/title, description, short_description, disambiguation ("YYYY, author"), format, language, page_count, publication_date/year, publisher, isbn10/13, series_name, url (image), popularity, affinity, tags.

Brands — hierarchical urn:tag:genre:brand:* (automotive, electronics, entertainment, fashion, food_and_beverage, games, health_and_beauty, mobile_app, retail, software, sports_organization, website, wine_and_spirits; subcats e.g. automotive:electric, electronics:headphones, mobile_app:streaming_service, fashion:footwear:sneakers, fashion:footwear:sneaker:basketball, sports_organization:basketball:nba), plus urn:tag:adjective:qloo (personality: innovative, luxurious, athletic, classic) and urn:tag:wikipedia_category:wikidata. Rich fields: description, official_site, founded_year, inception, headquartered, headquarters_address, direct_owner, parent_company, owned_by, industries, products, subsidiaries, brand_type, industry_categories, core_values, brand_personality, brand_adjectives, lifestyles, use_occasions, target_audience, psychographic_segments, customer_personas, key_influencer_types, aspirational_outcomes, celebrity_spokesperson, price_tier, business_model, target_markets, fashion_style, competitive_set, complementary_brands, sustainability_initiatives, audience_growth, popularity, affinity, tags. (Sports organizations are brands → answers the Devpost forum question about sports teams.)

Localities — urn:tag:genre:locality:{neighbourhood|suburb|city}; 59 enrichment tag categories incl. activity, best_month_for_travel, characteristic, climate, culinary_experience, culture, demographic_characteristic, entertainment_option, fauna, flora, ideal_traveler, language, {month}_event, {month}_event_type, {month}_travel_advisory, off_season_month, peak_tourism_month, photogenic_spot, popular_food_item, related_celebrity, scenery, shopping, transport, unusual_attraction, worst_month_for_travel (all urn:tag:<x>:qloo). Fields: name, place, admin_level (city 5, suburb 7, neighbourhood 10), lat, lon, geohash, population, website, popularity, affinity, disambiguation, tags. In-domain only (locality→locality); use localities as location signals for other types.

Movies — urn:tag:genre:media:* (action, adventure, animation, biography, comedy, crime, documentary, drama, fantasy, historical, horror, musical, mystery, romance, sci_fi, thriller, war) + granular urn:tag:keyword:media:* (based_on_novel, superhero_action, sequel, remake, surprise_ending, …) + urn:tag:streaming_service:media:* (where to watch). Fields: description, short_description, release_date/year, duration, content_rating, filming_location, production_companies, country_of_origin, external_links, popularity, affinity, audience_growth, akas, external ratings.

Music artists — urn:tag:genre:music:* (60s, eighties, acoustic, alt_country, alternative_rock, ambient, americana, bebop, blues, classic_rock, classical, country, dance, electronic, emo, experimental, folk, funk, gospel, hard_rock, heavy_metal, hip_hop, house, indie, indie_pop, indie_rock, jazz, metal, pop, punk, rap, reggae, rock, singer_songwriter, soul, techno, trance, …) + urn:tag:audience:qloo (loyal, passionate, youthful). Fields: short_description, date_of_birth, year_of_death, place_of_birth, akas, popularity, affinity, audience_growth.

People — urn:tag:genre:person:* (academic, activist, actor, athlete, author, chef, comedian, fashion_designer, influencer, journalist, lawyer, model, musician, politician, youtuber), urn:tag:occupation:person:* (actor, dancer, guitarist, investor, musician, physician, presenter, programmer, rapper, singer, talk_show_host, voice_actor, writer, …), wikidata categories. Fields: date_of_birth, gender, nationality, place_of_birth, parents, children, siblings, spouses, partners, awards, instruments, influences, employers, notable_works, positions_held, websites, interests, work_period_start.

Places — urn:tag:genre:place:* (adventure_sports, art_gallery, castle, historical_landmark, hotel [capsule, forest_resort, hostel, inn, resort, ski_resort, wellness], museum, park, restaurant [american, asian, bakery, bar, barbecue, cafe, fine_dining, italian, japanese, mediterranean, seafood, steak_house, vegan], shopping_mall, sports, tourist_attraction). Recipes also use urn:tag:category:place:italian_restaurant, urn:tag:culinary_style:qloo:fast_food, urn:tag:dining_options:place:brunch. Attribute tag families: urn:tag:ambience:qloo, amenity:place, accessibility:place, cuisine:qloo, customer_identity:qloo, decor:qloo, dining_option:qloo, dining_options:place, good_for:qloo, menu_highlight:qloo, nearby_attraction:qloo, neighborhood_characteristic:qloo, parking:place, payments:place, pets:place, room_type:qloo, service_options:place, service_type:qloo, setting:qloo, specialty_dish:place, view:qloo. Fields: address, city, admin1/2_region, country, country_code, metro, neighborhood, lat, lon, phone, website, menu_url, business_rating, price_level, currency, price_range, hotel_class, number_of_rooms, is_closed, popularity, affinity, audience_growth, tags.

Podcasts — urn:tag:genre:media:* (after_shows, arts, business, comedy, comedy_interviews, design, education, entrepreneurship, health_fitness, kids_family, medicine, mental_health, news, parenting, personal_journals, relationships, self_improvement, society_culture, tv_film, tv_reviews). Fields: channel, rating, episode_count (string), release_date, content_rating (clean/explicit), akas.

TV shows — genre tags (incl. reality_tv) + keyword tags (drug_cartel, psychological_thriller, workplace_comedy, serial_killer, …). Fields: release_date/year, finale_year, duration, content_rating, filming_location, production_companies, country_of_origin, external_links.

Video games — urn:tag:genre:media:* (2d_fighting, 2d_platformer, arcade, fps, moba, mmorpg, open_world_action, platformer, puzzle, racing, rhythm, role_playing, sandbox, shooter, simulation, soccer, strategy, survival, tactical_fps, …) + wikidata categories (platforms, engines, franchises). Fields: slug, developer, publisher, platforms (JSON string), release_date/year, content_rating (ESRB), media_franchise, franchise_series, akas.

Cross-domain examples from docs (input "Target"): books → true crime/biography; places → Disney World resorts; brands (input Harry Potter) → Air Jordan, Real Madrid, NBA; artists → mainstream country/acoustic; movies → family animated; people → country stars/reality TV; podcasts → Bachelor-franchise shows; TV → workplace comedies; games → tactical FPS. In-domain examples show coherent "taste neighborhoods" (Bob Dylan → Neil Young, Simon & Garfunkel; Breaking Bad → Better Call Saul, Sopranos; Minecraft → Roblox, Terraria).

## 3.8 Recipes (API Examples — all 22)

1. Restaurants like Balthazar in NYC: filter.type=urn:entity:place&signal.interests.entities=<ID>&filter.location.query=New York City&take=10. Find ID via /search?types=urn:entity:place.
2. Search entity by name: /search?query=Balthazar&types=urn:entity:place&take=3.
3. Find tag ID: /v2/tags?filter.query=rooftop bar&take=3.
4. Find audience ID: /v2/audiences?filter.query=sustainability&take=3 → use URN.
5. Popular restaurants, no user data (cold start): filter.popularity.min=0.9&filter.location.query=New York City.
6. Personalize by age/gender/location: filter.type=urn:entity:artist&signal.demographics.gender=male&signal.demographics.age=25_to_29&signal.location.query=New York City.
7. Audience segment as signal: filter.type=urn:entity:place&signal.demographics.audiences=urn:audience:hobbies_and_interests:outdoors&filter.tags=urn:tag:genre:place:hotel&filter.location.query=Denver.
8. From transaction history (POST): body {"filter.type":"urn:entity:place","signal.interests.entities.query":[{"name":"Nobu","address":"105 Hudson St, New York, NY"},{"name":"Balthazar","address":"80 Spring St, New York, NY"}],"filter.location.query":"Chicago","take":5}.
9. Multiple past destinations: filter.type=urn:entity:locality&signal.interests.entities=<PARIS>,<ROME>&take=5.
10. Near lat/lon: filter.location=POINT(-74.0060 40.7128)&filter.location.radius=2000 — radius required with POINT or nothing matches; results include distance (m).
11. Inside WKT polygon: filter.location=POLYGON((2.3270 48.8606, 2.3270 48.8796, 2.3602 48.8796, 2.3602 48.8606, 2.3270 48.8606)) — lon/lat order, polygon must close; affinity/distance null without a signal entity (ranked by popularity).
12. NYC except Midtown: filter.location.query=New York City&filter.exclude.location.query=Midtown.
13. Top per city across markets: diversify.by=properties.geocode.city&diversify.take=2&take=10; avoid country-level location filters, use a signal entity to drive distribution; results interleaved across cities.
14. Italian restaurants excluding fast food: filter.tags=urn:tag:category:place:italian_restaurant&filter.exclude.tags=urn:tag:culinary_style:qloo:fast_food.
15. Weighted tag signals (movies): signal.interests.tags=urn:tag:genre:media:horror,urn:tag:genre:media:thriller&signal.interests.tags.weights=20,7.
16. Taste tags describing an entity's audience: filter.type=urn:tag&filter.tag.types=urn:tag:ambience:qloo&signal.interests.entities=<ID> → results.tags[] with query.affinity.
17. Compare two brands' audiences: /v2/analysis/compare?a.signal.interests.entities=<LULULEMON>&b.signal.interests.entities=<PATAGONIA>&take=10.
18. Michelin AND Resy within 2 km: filter.external.exists=resy,michelin&operator.filter.external.exists=intersection&filter.location=POINT(...)&filter.location.radius=2000.
19. Heatmap, WKT point, MUJI in NYC: filter.type=urn:heatmap&filter.location=POINT(-73.99 40.74)&signal.interests.entities=E12201A5-CC50-40AF-97AE-C54A2CA303F7.
20. Heatmap for brand in polygon (Jacquemus, 93A50AC5-FCF2-4F47-87C0-E821E0B9F823): filter.type=urn:heatmap&filter.location=POLYGON((-74.0479 40.6829,-74.0479 40.7831,-73.9067 40.7831,-73.9067 40.6829,-74.0479 40.6829)) → results.heatmap.
21. Trending artists this week: /v2/trending?filter.type=urn:entity:artist&filter.start_date=…&filter.end_date=….
22. Resolve Spotify ID: /entities?external.spotify.ids=74KM79TiuVKeVCqs8QtB0B&take=1.

Known IDs from docs: New York locality 81E61924-6CEE-4AB4-93D3-282A5C784AB8; Charlize Theron B8BEE72B-B321-481F-B81A-A44881D094D6; Everything Everywhere All at Once F0D354AA-BA7E-49D2-8ABA-9A8250F5C852.

## 3.9 Gotchas checklist

- Wrong base URL → 401 (most common). Missing path → 404.
- Dev guide says /v2/insights is GET only (POST with JSON body fails with "No path matching request parameters"), but *.query params and weighted tag objects are documented as POST-only and a recipe uses POST → test on hackathon endpoint.
- Invalid params silently ignored → empty 200. Check Entity Type Parameter Guide.
- Tags/audiences must be real URNs from /v2/tags / /v2/audiences → else "at least one valid signal or filter is required".
- 403 = unsupported entity type.
- Response shapes differ: insights results.entities / results.tags / results.demographics / results.heatmap; /search and /entities flat results array; compare has no success.
- POINT needs radius; WKT lon-first; polygons close.
- No signal entity → affinity null (popularity ranking).
- Localities in-domain only.
- take max 50; page max 100.
- Hackathon environment may lack data for some entities/regions (docs are US/Paris-centric) → test target regions early (Athena is US-only: the 25 largest US metros).
- Scores from separate calls not comparable.

## 3.10 Docs sections NOT yet read

- Expanded 200/400 response schemas on each endpoint page (Deep Dive, Search, Entities, Tags, Compare, Trending) — exact output structures incl. explainability and trending fields.
- Parameter Reference "Signals" and "Output" tabs (content mostly covered via Deep Dive).
- Full types enum on /search and filter.type enum on Compare.
- "Processing Methodology" page (linked from Cross-Category Insights), "Heatmaps Overview", the affinity-scores blog post, the Key Use Cases index page. → In Claude Code, the fastest way to fill these is to hit the endpoints with a real key and inspect responses.
