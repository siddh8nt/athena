# Athena: the taste-led growth agent for consumer startups

*Plans a consumer startup's growth from 1 to n: where to grow, which venues to be in, who to partner with, what to say and when to show up, from what its customers already love.*

**Product Requirements Document**

| | |
|---|---|
| Version | 2.12 · 9 Oct 2026 |
| Owners | Siddhant, Jaiaditya |
| Event | Qloo Agentic Hackathon, "Agents, but with taste." |
| Deadline | 31 Oct 2026, 9:15 AM IST (30 Oct, 11:45 PM ET). **We submit on 28 Oct.** |
| Replaces | Earlier versions of this PRD under the working name "Carry" (v1.0 was food and drink only), the "Taste-Driven Distribution Agent" PRD and the "Crossover" PRD v0.1 |
| New in v2.0 | Scope is every consumer company that grows through places and partners: goods, tech and apps. The product is built from shared blocks. Demos show three use cases. Alcohol brands are out of scope. |
| New in v2.1 | Nothing is simulated: every brand runs live, and a "Try this" card replaces the guided tour. |
| New in v2.2 | Renamed **Athena**. Two owners: Siddhant and Jaiaditya. |
| New in v2.3 | Title: "Athena: the taste-led growth agent for consumer startups". |
| New in v2.4 | Everything runs on Google Cloud, paid from a $300 Free Trial credit (§14.8). Cloud Run and Firestore replace a VM and SQLite. The LLM is Gemini on Vertex AI, because the credit can't pay for Claude (§12.8). |
| New in v2.5 | **Key-day spike run on 8 Oct (§18):** 9 checks passed and 7 failed or needed workarounds; every finding is written into the method it affects. **The stockist blind test failed on the tuning brand** (1 of 87 hidden stockists found, §10.1). Hit counts are dropped, and the headline evidence becomes **With Qloo vs Without Qloo** (§10.2), with a pre-registered ranking check as a P1 measured claim (§10.3). **Two new blocks:** **Message** (how to talk to the crowd, §9.15–9.17) and **Moments** (when and where to show up, §9.18). **Free external sources and Google Cloud services fill only the gaps Qloo doesn't cover** (§11.2): Census market size, Overture neighbourhoods and venue contacts, Ticketmaster show dates, Podcast Index, Wikidata, Gemini URL context and Search grounding, and Imagen (P1). **Aggregate audience demographics are allowed, with fixed labelling** (§9.17). *Blind-test your own brand* is removed. Demo brands are chosen (§7.7). |
| New in v2.6 | **Qloo audience interests** join the Message block, limited to four allow-listed audience types and labelled like audience skew (§9.17, Q20). **The ranking check is P0** (§10.3, F27). **Moments is ordered by Qloo taste rank**, not by date (§9.18). **Every block shows how many Qloo calls built it** (F14). Audience-steered and tag-steered signals were tested on 8 Oct and aren't used (§11.1). |
| New in v2.7 | **Gemini runs on Vertex AI's `global` endpoint**, because both models returned 404 in `us-central1` on 8 Oct. Cloud Run and everything else stay in `us-central1`. Exact model IDs: `gemini-3.8-flash` and `gemini-3.1-pro-preview` (§12.8). **Billing facts from 8 Oct:** the credit is ₹28,796.63 (≈ $300) and ends 7 Jan 2027; Vertex calls failed until a payment method was added, which is not an upgrade (§14.8). S17 partly run (§18). |
| New in v2.8 | **Signal rule changed (§7.5):** when the brand is in Qloo, Markets, Partners, Message and Moments use the brand entity plus comparables as the signal; Places and the Read card keep the accounts. A live Brightland comparison on 8 Oct showed the accounts-only signal returning New York venue-crowd taste (fashion partners, Bronx hip-hop artists, Chicago first), while the brand signal returned Brightland's real markets and category (§18). |
| New in v2.9 | **Moments dates rebuilt from live tests (§9.18):** festival dates come from Gemini 3.1 Pro (`gemini-3.1-pro-preview`, thinking LOW) with Google Search **and** URL context, streamed so the rail narrates each step; demo brands' dates are fetched ahead of time by the warm-cache job. **Only confirmed dates are shown:** no "date unknown", "not found" or error rows anywhere; an unconfirmed festival is left out and the next one is checked. Every block retries once, then shows its last good result (§14.2). Grounded results carry Google's required Search Suggestions chip. |
| New in v2.10 | **Without Qloo runs live on Places** (§9.9): Gemini 3.1 Pro with Google Search, streamed, every venue checked in Qloo. **The landing line now leads with dead picks and taste fit** (§2.2), because the first live comparison (Brightland, LA, 8 Oct) showed the chatbot's picks were *less* often among Qloo's most popular 5% than Athena's (27% vs 35%); results in §10.2. |
| New in v2.11 | **Without Qloo is on Places only** (§9.9, §10.2). On Partners, Message and Moments the comparison had no outside check: taste fit there is scored by Qloo itself, themes can't be scored at all, and Athena's festival dates also come from Gemini with Search. Places stays, framed as an illustration; the ranking check (§10.3) is the independent test. **"Dead picks" becomes "couldn't verify"**: a chatbot venue Qloo can't match within 40 miles may still exist. **Every block header carries one quiet line saying how it was ranked** (§13.1), beside "Built from n Qloo calls", so Qloo is visibly the engine of each block without a slogan. |
| New in v2.12 | **Podcasts get "Who listens", based on Qloo Insights** (§9.6): with each of the top 5 podcasts as the signal, Qloo gives the listeners' skew, the brands and TV they love, the brands they share with your crowd (the bridge rule, §9.8) and how they rank you among brands like you. Tested live on Brightland's podcasts on 8 Oct. **Apple Podcasts replaces Podcast Index** (§9.19): keyed by the Apple ID Qloo returns, no key needed; it gives the real episode count (Qloo's `episode_count` was "15" for every podcast), the latest episode date, the genre, and from the show's RSS feed its website and contact email. **Public audience numbers on request** (§9.6): Gemini with Search names figures and their pages; Athena opens every page and keeps a figure only if the page shows the number within 200 characters of the show's name (sponsor pages: only the show's own), because on 9 Oct Gemini returned no grounding sources for these answers and invented two of its URLs. **Gemini 429s** (§12.8): every call goes through one gate with backoff, spacing and a Pro-to-Flash fallback. **Streaming fix** (§12.8): the final streamed event, which carries the answer's end and its sources, was being dropped. |

**How to read this document**

- **P0** ships for the demo. **P1** ships if on schedule. **P2** ships only with spare time.
- **[VERIFY]** means: not yet confirmed against the live service. **[DECISION]** means: a default is set, and it's yours to change (§22).
- **"Measured on 8 Oct"** marks a number from the key-day spike (§18). Any number marked *illustrative* is a placeholder that never ships.
- **Source labels:** every value on screen carries one source label: **Qloo**, **Census**, **Overture**, **Ticketmaster**, **Apple Podcasts**, **Wikidata**, **Web** (Google Search grounding) or **Agent** (LLM-written text). The label is part of the requirement, not decoration.

---

## 1. Summary

**One line.** A founder tells Athena where their customers already are: the venues that sell them, their own brand, or brands they're like. Athena returns a 1-to-n growth plan made of named targets: which cities to enter and in what order, which venues to be in, which brands and podcasts to partner with, how to talk to the crowd, and which dated events to show up at. Every pick carries Qloo evidence, the venue picks can be compared side by side with a chatbot that has no Qloo access, and the plan re-ranks from the founder's wins and declines.

**Problem.** Consumer companies grow by deciding where to show up next, who to partner with and what to say: the cafés that should stock a snack brand, the city a social app should launch in next, the brands a headphone company should collaborate with, the podcast worth sponsoring, the festival worth a pop-up. Paid social got more expensive and harder to measure, so these decisions now carry more of the growth. They're still made with Google Maps, gut feel and whoever answers a cold email.

**Insight.** *A brand's places and partners are its customers' fingerprint.* Qloo may never have heard of a $3M snack brand, but it knows the cafés that stock it and what their crowds love, across venues, cities, brands, podcasts, TV, film, music and books. Twelve accounts, or three comparable brands, become a taste signal Qloo can read anywhere.

**Thesis.** Meta gave brands lookalike audiences. Athena gives them lookalike places, partners and moments.

**One job, six blocks.** The input is always taste: accounts, or the brand and brands like it. The output is always built from the same six blocks:

| Block | The question it answers | What the founder gets |
|---|---|---|
| **Markets** | Where should we grow next? | Ranked US metros with a one-line reason, Census population and median household income, and the named neighbourhoods where the crowd's taste concentrates |
| **Places** | Which venues should we be in? | Ranked, named venues (stockists, event venues, pop-up and demo spots), each with at least 2 evidence chips and contact details |
| **Partners** | Who should we team up with? | Collab brands scored from both sides, and podcasts to sponsor, each with who listens (Qloo), how recently it published and who to contact |
| **Message** | How should we talk to our crowd? | Taste themes, cultural references (TV, film, music, books), positioning against up to 3 competitors, a labelled aggregate audience skew, the crowd's top interests (Qloo audiences), and hooks and content ideas. P1: a generated mood board |
| **Moments** | When and where should we show up? | Dated upcoming shows by the crowd's favourite artists in the target city, and taste-matched festivals with dates and sources |
| **Act** | What do we do on Monday? | Outreach drafts, an 8-stop route, and a pipeline that re-ranks from wins and declines |

The agent reads the business, decides which blocks it needs and in what order (the recipe, §7.6), and shows that decision on an editable card. A snack brand gets Places first. A social app gets Markets first. A headphone brand gets Partners first. Same engine, same screen.

**Why only Qloo.** An LLM can name popular cafés, big cities and famous brands. It cannot:

1. measure which venues' crowds match a brand's twelve best accounts;
2. carry that match into a city where it has never seen the brand;
3. rank cities by how much of the crowd's taste they hold;
4. score a partnership from both sides: how much their crowd likes you, and how much yours likes them;
5. name the shows, films, artists, podcasts and festivals this specific crowd over-indexes on;
6. re-rank from what a brand wins and loses.

Athena does all six. On Places, the judge can flip **Without Qloo** to see a chatbot answer the same question, with each of the chatbot's venues looked up in Qloo.

**What else Athena uses, and why.** Free public sources and Google Cloud services fill only the gaps the key-day spike proved Qloo doesn't cover: market size, neighbourhood names, contact details, event dates, podcast details and website reading (§11.2). They never rank anything. Every value shows its source label.

**Why it wins.** Each judging criterion has a specific answer:

- **Technological implementation:** cross-city signal transfer; two-call rank scoring over fixed pools; two-sided scoring (bridges and mutual fit); shared-pool positioning; Qloo-ranked moments joined to dated events; a grounding validator. They use 15 Qloo capabilities, each tested live on 8 Oct (§11.1), and every block shows how many Qloo calls built it.
- **Design:** a live app on arrival, a five-step "Try this" guide, one screen whose six blocks reorder for each business, a **Without Qloo** toggle on Places, a line on every block saying how it was ranked, and every number opens its source.
- **Potential impact:** a consumer founder's next growth decisions, turned into named targets they can act on tomorrow.
- **Quality of the idea:** places and partners as a taste fingerprint; lookalike places, partners and moments; two-sided partnership fit; outcomes as signal.

**Honesty.** The stockist blind test was run on the tuning brand on 8 Oct and failed (§10.1). Athena makes no accuracy claim it hasn't measured, and the Method page publishes the failed test.

---

## 2. The demo (everything else serves it)

A judge who gives it two minutes leaves convinced. A judge who gives it ten finds depth wherever they click. Nothing is simulated: every brand runs the real ranking code, and every number is computed from real Qloo responses.

### 2.1 Principles

1. **Live on arrival.** No signup, no setup, no empty states. The hero brand loads when the page opens. Its first card line appears within 3 seconds, and each block within 5 seconds, because the demo brands' Qloo responses are pre-warmed (§14.9).
2. **Real data, cached responses.** The server caches Qloo and external responses (§11, §14.9). It never caches answers: rankings, scores and labels are recomputed from those responses on every load. Two things are cached as finished results, each labelled with its date: the Without Qloo answers for the demo brands (slow and paid per run, so Re-run is capped), and the fallback in §14.2.
3. **We guide; we never drive.** The "Try this" card points at real buttons. The app never clicks for the judge.
4. **The evidence is a comparison the judge triggers.** The **Without Qloo** toggle on Places swaps Athena's venues for a chatbot's answer to the same question, with every chatbot venue looked up in Qloo (§10.2).
5. **Every number explains itself** in one line, and opens the call that produced it.
6. **Measured looks different from written.** Data values use tabular numerals and a source label. Agent-written text is labelled **Agent**.
7. **"Measured" appears in one place only:** the ranking check (§10.3), and only if it passes its pre-registered rule. Everything else is labelled **demonstrated**.
8. **No dead ends.** Weak results show the agent recovering, in the rail. If Qloo or the LLM is down, the brand's last live run fills in, labelled with its time.
9. **One screen.** Versatility comes from the agent reordering the six blocks, never from a new screen.

### 2.2 The landing page is the app

The page opens straight onto the workspace (§13.1), with the hero brand loading. Around it:

- **Title:** "Athena: the taste-led growth agent for consumer startups"
- **Subtitle:** "Plans your growth from 1 to n: where to grow, which venues, who to partner with, what to say and when to show up."
- **Comparison line,** computed from the hero's Places block and its dated Without Qloo answer: *"Same question, with and without Qloo: of the chatbot's [N] venues, [b] are closed or couldn't be verified in Qloo, and the rest rank #[r] of [P] on your crowd's taste in Qloo. Every one of Athena's [N] carries Qloo evidence."* The bracketed values are computed, never typed; the line appears only once a comparison exists. It links to the Method page. (Changed 8 Oct: the live Brightland comparison put 27% of the chatbot's venues and 35% of Athena's among Qloo's most popular 5%, so "most popular" moved off the headline and is shown for both sides on the Method page.)
- **Brand switcher:** the three demo brands (§7.7), each one click:
  - Brightland: "Venues · partners · message"
  - Timeleft: "Launch cities · moments"
  - Master & Dynamic: "Partners · moments"
- **Headline button:** **Try your own brand** (a name, a website or a pasted list).
- **The "Try this" card** (§2.4).
- **Footer:** Method · Sources · What we don't know · GitHub · "Demo plans for real brands are illustrative and unaffiliated." · data attributions (§15).

### 2.3 Key moments

| # | Moment | What the judge does | What happens | Why it wins |
|---|---|---|---|---|
| M1 | **It reads you** | Opens the page, or picks a brand | The **"How I read your business"** card fills in line by line, each line with evidence. **What you sell:** olive oil, premium ("your accounts average price level 2.8 of 4", *illustrative*). **How you grow:** through venues and retail. **Channels:** gift shops, gourmet grocers, cafés. **Taste signal:** 56 NYC accounts. **Competitors:** 2 suggested. **Tuned ✓.** The judge clicks **Looks right** or **Edit**. | The agent decides; the person confirms or corrects it. |
| M2 | **Where** | Watches, or clicks a metro | **Markets** stream in with reasons and a Census line ("2.6M households · median income $X", *illustrative*). The map flies to the target metro, the heatmap glows where the taste concentrates, and the top 5 neighbourhoods are named. | Only Qloo can rank cities by a crowd's taste. |
| M3 | **Who, then the comparison** | Reads **Places**, then flips **Without Qloo** | **Places:** 20 named venues with evidence chips. **Without Qloo:** the chatbot's venues replace them. Each one is marked *found* (with its Qloo popularity percentile), *closed* or *unverified*, and the comparison line updates. | The challenge's "outperform generic LLM-only approaches", shown on the judge's own click. |
| M4 | **Why** | Clicks any pick or number | The drawer: "Priority 4 · Like your accounts [Shop A] and [Shop B] · Shared: minimalist, design-led · Crowd growing." Any number opens its call in the trace, with keys redacted. | Provenance, for Qloo's CTO. |
| M5 | **Partners** | Opens **Partners** | Collab brands with two-sided bars ("you → them: 91st percentile · them → you: #1 of 15 brands like you"). Podcasts with their website and last-episode date. | Two-sided fit nobody else computes. |
| M6 | **Message** | Opens **Message** | Taste themes ("Connection, Authenticity"), cultural references ("Chef's Table, Julie & Julia, Brandi Carlile"), positioning against a competitor ("shared: modern, minimalist · only you: authenticity"), the labelled audience skew, the crowd's top interests ("Cooking · Arts & Crafts · Organic Ingredients"), and 5 hooks, every claim linked. Flip **Without Qloo** to see the chatbot's generic persona. | Creative direction grounded in what a real crowd loves. |
| M7 | **Moments** | Opens **Moments** | "Your crowd's #2 artist plays Chicago on [date] at [venue] (Ticketmaster)." "Andersonville Midsommarfest, [date] (Web source)." Ordered by taste rank, each with its date and source. | A dated plan, and Live Nation's own data used well. |
| M8 | **It acts and learns** | Clicks **Draft** on a venue, **Plan a day**, then marks a pick won and another declined | A draft that opens with a bridge: "Crowds like yours and ours both over-index on [Brand X] and [Brand Y]." An 8-stop route with a Google Maps link and a calendar file. The re-rank runs: similar venues move with a reason ("they resemble your declines: takeaway-only"). | A complete job, and a loop that learns. |
| M9 | **Same agent, other businesses** | Switches to Timeleft, then Master & Dynamic | The card reads each differently and the tabs reorder: Timeleft opens on Markets (launch order) and Moments; Master & Dynamic opens on Partners. | Versatility comes from the agent's decision, not a menu. |
| M10 | **Your brand** | Clicks **Try your own brand**, and types a name or pastes a website | Any consumer company. From a website, the card fills itself in (§9.20). The plan streams in, block by block, with a Tuned or Beta badge. | Judges use it on brands they care about. |

### 2.4 The "Try this" card

- **Five items, each pointing at a real button:**
  1. Flip *Without Qloo* on Places (M3)
  2. Open a pick's evidence (M4)
  3. See your crowd's message (M6)
  4. Find a moment (M7)
  5. Switch brand (M9)

  Below them: "Then try your own brand."
- **Items tick off** as the judge does them. The card makes the right button pulse; it never presses it.
- **Out of the way:** it collapses, and reopens from **?** in the top bar. On phones it's a chip that opens a bottom sheet.
- **Deep links:** each item has a URL (for example `/brightland?try=compare`) that opens the brand and highlights that button. The Devpost page links straight to them.
- **Target:** a first-time judge who follows the card reaches the Without Qloo comparison within 60 seconds of arriving.

### 2.5 The ten-minute layer

- **Method page:** the key-day spike results (§18), the failed blind test with its numbers and diagnosis (§10.1), how the comparison is computed (§10.2), the ranking check's registration and result (§10.3), the Without Qloo model and prompt, and the caveats.
- **Sources page:** every data source, what it's used for, its licence or terms, and its attribution (§11.2, §15).
- **Trace drawer:** every Qloo and external call with its endpoint, parameters (keys redacted), status, result count and latency.
- **Beta categories:** any brand a judge types runs, with an honest Tuned or Beta badge.
- **What we don't know** page (§21).
- **Repo:** one-command tests for every method, and a fixture mode that runs without keys.

---

## 3. Goals, non-goals and the judging map

### 3.1 Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | Pass Stage 1: clearly agentic, with Qloo central | A live run for every brand, with visible tool calls and reasons, a business read the founder can correct, questions, recovery, approvals and an outcome loop |
| G2 | A visible With Qloo vs Without Qloo difference on every demo brand | The comparison metrics in §10.2, computed for each demo brand by 25 Oct and published whatever they show |
| G3 | Judges reach the comparison fast | ≤ 60 s from arriving, following the "Try this" card |
| G4 | Versatility that holds up | Three recipes demoed with strong output; 5 categories tuned and passing the QA checklist (§16) |
| G5 | Real-world evidence | ≥ 5 founder calls across goods, tech and apps, quoted; ≥ 1 real brand runs Athena on its own data before 26 Oct |
| G6 | Nothing breaks | Zero errors on the "Try this" path in 5 fresh-browser rehearsals; live and free through 17 Nov |
| G7 | Ship early | Submitted on 28 Oct |
| G8 | Zero spend outside the credit | All Google Cloud usage stays inside the $300 Free Trial credit; no card is ever charged; every external API is on a free tier (§14.8) |

### 3.2 Non-goals

- Paid ads, ad targeting, audience segmentation for ads, influencer marketing, creators, or any individual person as a target.
- Inferring anything about an individual. Aggregate audience skew is shown only under the rules in §9.17 and is never used to rank, filter or target.
- Sending messages or contacting anyone. Athena drafts; people send.
- Alcohol brands, and utility apps that don't grow through places or partners.
- Custom outputs for particular categories: PDF packs, site briefs, launch documents.
- Markets outside the US.
- Replacing a CRM.
- Selling tickets or replicating a ticketing experience. Moments links out to the source for tickets.

### 3.3 Judging map

| Criterion | What we show | Where |
|---|---|---|
| Technological implementation | The methods in §1; 15 Qloo capabilities, each tested live (§11.1), with per-block Qloo call counts; gap-filling sources joined to Qloo results, each labelled (§11.2); tests for every method | M2–M9, Method page, trace, repo |
| Design | A live app on arrival; a five-step "Try this" guide; one screen whose six blocks reorder per business; a Without Qloo toggle on Places; every block says how it was ranked; every number clickable; the 5-second test passed; a phone layout | §2, §13 |
| Potential impact | Three specific users with weekly jobs; output that is tomorrow's call list, launch city, collab shortlist, message and event calendar; a real brand and founder quotes; a market that spans consumer goods, tech and apps | M5–M10, Devpost, §4 |
| Quality of the idea | Places and partners as a taste fingerprint; lookalike places, partners and moments; two-sided partnership fit; outcomes as signal | M1, M5, M7, M8 |

---

## 4. Users, scope and positioning

### 4.1 Who it's for

**Founders and growth leads at consumer startups whose growth depends on where they show up and who they partner with.** Three people, one per demo:

| Person | Company | Their question | The block Athena opens with |
|---|---|---|---|
| Maya, head of sales | A cold-brew brand in 14 NYC cafés | "Which cafés next, here and in Chicago?" | Places (stockists) |
| Dev, founder | A social events app, live in NYC | "Which city next, and where do we host the first events?" | Markets (launch order) |
| Lena, growth lead | A headphone brand | "Which brands and shows should we team up with?" | Partners |

**Shared job to be done:** "Tell me where to grow next and exactly who to approach there."

### 4.2 Secondary users

- **Brokers and regional distributors:** "Rank my prospect list for this brand, with evidence I can show the buyer." Served by *Score a list* (F30).
- **Agencies:** white-label use. Roadmap only.

### 4.3 Scope

- **In:** consumer goods (G1–G8), consumer tech (T1–T3), apps that grow through places or partners (A1–A3), and brands opening their own locations (L1). The full matrix is in §7.3.
- **Tuned at launch:** 5 categories: G1 packaged food, G2 non-alcoholic drinks, T1 consumer hardware, A1 city-launch apps, and **G4 home** (chosen on 8 Oct by stockist coverage, §22). Every other category runs with a **Beta** badge.
- **Out:** alcohol brands; pure utility and productivity apps (A4); regulated health products; B2B companies; businesses that grow only through paid ads or app-store ranking. The card says why in one line and offers the demos.
- **Where we start:** food, drink and home brands selling wholesale. Their stockist lists are public, which gives demo signals and the ranking check (§10.3), and it's a large market: Faire alone had 100,000+ brands in March 2024 [4].

### 4.4 Alternatives

| Alternative | What it does | The gap Athena fills |
|---|---|---|
| Google Maps, Yelp | Find venues by category and rating | They don't match by crowd, and can't rank cities or partners by taste |
| LLM chat | Lists famous places, cities, brands and generic personas | It guesses and skews toward the obvious. It can't score fit or learn. It's the Without Qloo comparison on Places (§10.2). |
| Faire | Runs an inbound wholesale marketplace | Retailers come to you; it doesn't choose whom you approach |
| SPINS, NielsenIQ | Sell-through data for products already stocked | They can't rank venues that don't carry you yet |
| Audience-research tools and agencies | Describe your current audience | A mirror, not a door: they don't rank whom to approach next |
| Field-sales CRMs | Track visits and orders | They don't find or rank new accounts or partners |

### 4.5 Why now

- **Paid acquisition got expensive.** By 2022, brands were losing about $29 on every new customer they acquired [1]. Apple's iOS 14.5 tracking changes made paid social harder to measure [2].
- **Software for wholesale works.** Faire was valued at $12.4B in 2021 [3]. It had 100,000+ brands (March 2024) and about 700,000 independent retailers (June 2023) [4]. That covers the inbound side. Deciding whom to approach is still Google Maps and gut feel.
- **Capital is scarce.** Consumer startups on Carta raised just under $800M across 111 rounds in Q1 2025, the lowest quarterly totals on both counts since at least 2019 [5]. Brands need growth they can afford, not brand strategy.

### 4.6 Business model (hypotheses for the founder calls)

- **Who pays:** consumer brands of every kind, per seat per month; brokers and distributors, per territory; agencies, white-label (later). Price points to test: **$99 and $299 a month**.
- **Moat:** outcome data across every motion: stockists won, venues booked, collabs signed. Each outcome becomes a labelled example by category, tier and metro, and nobody else has that data.
- **Path:** food, drink and home wholesale → other goods sold through venues → partnerships for consumer tech → launch planning for apps → an MCP tool so other agents can call Athena.
- **Data terms for a paid product:** Ticketmaster's terms bar revenue from its API, so paid tiers either sign a Ticketmaster agreement or show festivals only in Moments. Census, Overture and Wikidata allow commercial use under their licences (§15). Apple's Search API terms are written for promoting store content [VERIFY use in a paid product]; RSS feeds are public.

---

## 5. Glossary

| Term | Meaning |
|---|---|
| Account | A venue that already sells the brand, entered by the user. Accounts form the signal. |
| Stockist | A venue that sells the brand, from the brand's public list. Used for demo signals and the ranking check (§10.3). |
| Signal | The Qloo entities that drive ranking: accounts plus wins; or the brand plus comparable brands. |
| Block | One of Markets, Places, Partners, Message, Moments and Act. Everything on screen belongs to a block. |
| Motion | How a business grows: venue, retail, city_launch, partnership or location_opening. |
| Recipe | The blocks a motion uses, and their order (§7.6). |
| Tuned, Beta | A Tuned category passed the coverage checks and the QA checklist. A Beta category runs with a visible badge. |
| Pool | A fixed set of at most 50 candidates (venues, partners or tags) scored in a single Qloo call with `filter.results.entities` or `filter.results.tags`. 50 is Qloo's `take` maximum (measured on 8 Oct). |
| Unscored | A pool member Qloo returns no score for. About a third of a venue pool came back unscored on 8 Oct. Unscored items rank after scored ones and show "no taste score". |
| Pick | A venue or partner in a block's ranked list. |
| Evidence chip | A one-line, clickable reason built from a Qloo field, such as "Like your [account]" or "Shared: brunch". Never LLM text. |
| Fingerprint | The top allow-listed Qloo tags that describe the signal's crowd. |
| Theme | A Qloo tag of type `urn:tag:theme:qloo` that describes the crowd, such as "Connection" or "Longevity". |
| Cultural reference | A TV show, film, artist or book that Qloo ranks highly for the signal. A reference, never a person to contact. |
| Positioning | Which taste tags the brand shares with a competitor, and which are distinct to each, computed over a shared pool (§9.16). |
| Audience skew | Qloo's aggregate age and gender affinity for the signal, relative to the average, shown only under the rules in §9.17. |
| Audience interest | A Qloo audience (for example "Cooking" or "Arts Crafts") ranked by affinity to the signal, from four allow-listed audience types only, shown under the rules in §9.17. Describes people who share the taste, never the brand's customers. |
| Moment | A dated event in the target metro: a show by an artist the crowd ranks highly, or a taste-matched festival (§9.18). |
| Bridge | A brand that ranks high with both a venue's crowd and the accounts' crowd (§9.8). |
| Mutual fit | A partner's score from both sides: their rank in your list, and your rank among 15 brands like you in theirs (§9.6). |
| Without Qloo | The same question answered by the LLM with Google Search grounding and no Qloo tools, with every pick checked (§9.9). |
| Measured, demonstrated | Measured means checked against ground truth under a pre-registered rule (only §10.3). Demonstrated means shown with evidence, without an accuracy claim. |
| Source label | The tag on every value naming its origin: Qloo, Census, Overture, Ticketmaster, Apple Podcasts, Wikidata, Web or Agent. |
| Enrichment | A value from a non-Qloo source attached to a Qloo result, such as a phone number, population or show date. Enrichments never change a rank. |
| Metro, neighbourhood | One of the 25 largest US metro areas (a config list), and an Overture neighbourhood polygon inside it. |
| Live run | A run that calls Qloo and the LLM now (through the response cache). |
| Warm cache | Qloo responses for the demo brands, refreshed daily by a scheduled job so demo blocks load in seconds (§14.9). |
| Fallback | A brand's last live run, shown with its time when Qloo or the LLM is down or a cap is reached (§14.2). |
| Fixture | Synthetic data shaped like Qloo's, labelled FIXTURE, for building and testing without keys. |

---

## 6. Flows

### 6.1 Core loop

**Read → (blocks in recipe order) → Act → Record → Re-rank.** The blocks are Markets, Places, Partners, Message and Moments, in the order the recipe sets (§7.6). Every step shows its reasoning in the rail. No outbound action happens without the user. Every outcome changes the ranking.

### 6.2 Try your own brand (M10)

1. **Input:** the brand name (required). Optional:
   - a website URL (up to 3 URLs: home page, about page, store-locator page);
   - a one-line description;
   - accounts, as pasted text, a CSV, or an image of a list;
   - comparable brands;
   - up to 3 competitors;
   - a target city.
2. **Read the website (if given):** Gemini with the URL context tool reads the pages (§9.20) and proposes the category, tier, products and, if the pages list them, stockists. Athena's own server never fetches the URL.
3. **Parse:** the LLM turns pasted text or an image into rows (name, address, city), and the user sees the table before anything runs.
4. **Resolve:** accounts are matched to Qloo places, and brands, comparables and competitors to Qloo brands (§9.1). Ambiguous matches become choice chips, with at most 3 questions, asked together. Accounts Qloo doesn't have are looked up in Overture so they still appear on the map, labelled "not in Qloo" (§9.19).
5. **Read card:** the card shows the category, tier, stage, how the business grows, the channels, the partner types, the competitors and the taste signal, with a Tuned or Beta badge, plus *Looks right* and *Edit*. If there are no accounts and Qloo doesn't have the brand, the agent suggests 3 comparable brands for the user to confirm.
6. **Blocks:** they stream in, in the recipe's order, each as soon as its calls return.
7. **Without Qloo:** available on Places, capped (§14.5).
8. **Pipeline:** kept in an anonymous session for 7 days.

### 6.3 Signal by stage

The full table is in §7.5. In short:

- **No accounts:** the brand and comparable brands.
- **1–9 accounts:** accounts plus brands.
- **10 or more accounts:** accounts only, plus wins.

This stage signal drives **Places** and the **Read card**. When the brand is in Qloo, **Markets, Partners, Message and Moments** use the brand entity plus comparables at every stage (§7.5).

---

## 7. Internal playbooks (never shown as a menu)

### 7.1 How it works

**Playbook = Category × Tier × Stage × Motions.** The agent infers all four, shows them on the card with evidence, and lets the founder edit them. Together they produce one config object that decides:

- the signal;
- the recipe: which blocks appear, and in what order;
- the venue types for Places;
- the partner types;
- the competitors used for positioning;
- the target metro;
- the tier filters;
- the kind of draft, and the pipeline's stage names.

**Build rule:** anything that can't be expressed through the six blocks doesn't get built.

```ts
type Motion = "venue" | "retail" | "city_launch" | "partnership" | "location_opening";
type Block = "markets" | "places" | "partners" | "message" | "moments" | "act";

type PlaybookConfig = {
  category: CategoryId;                  // "G2", "T1", "A1", … (§7.3)
  status: "tuned" | "beta";
  tier: "mass" | "mainstream" | "premium" | "luxury";
  stage: "prelaunch" | "early" | "scaling";
  motions: Motion[];                     // ordered; the first motion leads
  blocks: Block[];                       // derived from the motions (§7.6)
  signal: { accounts: QlooId[]; wins: QlooId[]; declines: QlooId[];
            brand?: QlooId; comparables: QlooId[]; tags: TagUrn[] };
  placeChannels: TagUrn[];               // venue types, OR'd together
  partnerTypes: ("brand" | "podcast")[];
  tierParams: Record<string, string>;    // §7.4
  partnerParams: Record<string, string>; // reach window, price-tier match (§7.5)
  competitors: QlooId[];                 // ≤ 3, for positioning (§9.16)
  targetMetro: MetroId;                  // one of the 25 metros (config list)
  exclude: QlooId[];                     // accounts, wins, declines, own brand, competitors
  draftKind: "venue_pitch" | "buyer_pitch" | "event_inquiry" | "collab_inquiry" | "sponsorship_inquiry";
  pipelineStages: string[];              // stage names for this recipe (§7.6)
};
```

### 7.2 Reading the business (the M1 card)

1. **Classify.** The LLM classifies the description into JSON (Appendix B): category, tier, motions, confidence and a one-line why. It also sees the brand's Qloo tags, if the brand resolves, and the venue types of any accounts.
2. **Check the tier against evidence.** The evidence is the brand's and comparables' `properties.price_tier`, and the accounts' mean `price_level` and `business_rating`. When the evidence and the LLM disagree, the evidence wins, and the card says why.
3. **Set the stage.** For venue and retail growth it comes from the account count (§7.5). For apps and partnership-led brands, which have no accounts, it comes from the description ("live in NYC" → early) and is confirmed on the card.
4. **Check the motions.** Accounts that are venues imply venue or retail growth. An app with no physical accounts implies city launch or partnerships.
5. **Low confidence** (below 0.6) triggers one question: "Do you grow mostly through shops, venues or partnerships?"
6. **Out of scope:** a one-line reason, plus the demo cards.

The card, for the goods demo brand (values *illustrative* until the live run):

> **How I read your business** · Tuned ✓
> - **What you sell:** olive oil, premium. *Your accounts average price level 2.8 of 4.*
> - **How you grow:** through venues and retail. *Most of your accounts are gift shops, gourmet grocers and cafés.*
> - **Channels I'll look at:** gift shops, gourmet grocers, home goods stores, cafés, bakeries, cheese shops
> - **Taste signal:** your 56 NYC accounts in Qloo
> - **Competitors for positioning:** 2 peers from Qloo's peer set (edit to name your own)
> - **Stage:** scaling (56 accounts)
>
> *[Looks right]  [Edit]*

### 7.3 Category matrix

Venue types were checked on 8 Oct (S3): each needs ≥ 20 venues in New York, Los Angeles and Chicago. Confirmed URNs (all `urn:tag:genre:place:…`): `restaurant:cafe`, `restaurant:coffee_shop`, `restaurant:bakery`, `restaurant:brunch`, `restaurant:deli`, `restaurant:cheese_shop`, `restaurant:health_food`, `gift_shop`, `home_goods_store`, `grocery_store`, `gourmet_grocery_store` (Chicago 18), `gym`, `spa`, `art_gallery`, `wine_store`, `festival`. **Boutique hotels (≤ 3 per city) and concept stores (0) don't exist as usable Qloo tags and are removed from every category.** Types marked * below are still unchecked.

**Consumer goods**

| ID | Category | Default motions | Places channels | Partner types | At launch |
|---|---|---|---|---|---|
| G1 | Packaged food and snacks | venue, retail | Gift shops, gourmet grocers, grocery stores, cafés, coffee shops, bakeries, delis, cheese shops | Brands, podcasts | Tuned |
| G2 | Non-alcoholic drinks (coffee, tea, functional, soft drinks) | venue | Cafés, coffee shops, brunch spots, health-food spots, gyms, grocery stores | Brands, podcasts | Tuned |
| G3 | Beauty and personal care | retail, partnership | Spas, gift shops, beauty supply stores* | Brands, podcasts | Beta (only 1 brand with qualifying stockists, §22) |
| G4 | Home and lifestyle | retail, partnership | Gift shops, home goods stores, art galleries, cafés with decor tags | Brands, podcasts | Tuned (§22) |
| G5 | Fashion and accessories | retail, partnership | Clothing boutiques*, gift shops | Brands, podcasts | Beta |
| G6 | Wellness products (non-medical) | venue, partnership | Gyms, spas, health-food spots, yoga studios (thin in Chicago) | Brands, podcasts | Beta |
| G7 | Pet | retail, venue | Pet-friendly cafés (pet tags), pet shops* | Brands | Beta |
| G8 | Baby and kids | retail, partnership | Family-friendly venues (good-for tags), specialty shops* | Brands | Beta |

**Consumer tech**

| ID | Category | Default motions | Places channels | Partner types | At launch |
|---|---|---|---|---|---|
| T1 | Consumer hardware (audio, wearables, smart home) | partnership, retail | Electronics stores*, art galleries and coffee shops for co-display, pop-up neighbourhoods | Brands, podcasts | Tuned |
| T2 | Accessories and peripherals | partnership, retail | Electronics stores*, coffee shops for co-display | Brands, podcasts | Beta |
| T3 | Personal mobility (e-bikes, scooters) | city_launch, partnership | Cafés and gyms as demo hubs | Brands | Beta |

**Apps**

| ID | Category | Default motions | Places channels | Partner types | At launch |
|---|---|---|---|---|---|
| A1 | City-launch apps (social, events, dating, local marketplaces) | city_launch | Event venues: cafés, brunch spots, art galleries, parks* | Brands, podcasts | Tuned |
| A2 | Lifestyle subscription apps (fitness, food, wellness) | partnership, city_launch | Partner locations: gyms, yoga studios, cafés | Brands, podcasts | Beta |
| A3 | Media and entertainment apps (music, audio, games, streaming) | partnership | Activation venues | Brands, podcasts | Beta |
| A4 | Utility and productivity apps | — | — | — | Out of scope; the agent explains |

**Locations**

| ID | Category | Default motions | Places channels | Partner types | At launch |
|---|---|---|---|---|---|
| L1 | Brands opening their own sites (cafés, studios, stores) | location_opening | Complementary neighbours | Brands | Beta |

**Never in scope:** alcohol brands. Bars are not a default channel for any category; a founder can add them on the card.

The fifth tuned category is G4 home (decided 8 Oct, §22): Paddywax has independent stockists in 13 metros, while beauty had one qualifying brand.

### 7.4 Tiers

The same business at a different tier gets different venues, neighbourhoods and partners. All values are starting points, set on the tuning brand and frozen in `prereg-v2` (§10.3).

| Parameter | Mass | Mainstream | Premium | Luxury |
|---|---|---|---|---|
| `filter.price_level.min/max` (places) | 1–2 | 1–3 | 2–4 | 3–4 |
| `filter.popularity.min` (places) | 0.5 | 0.3 | — | — |
| `bias.quality` (places) | — | low | medium | high |
| `filter.properties.business_rating.min` | — | 3.5 | 4.0 | 4.3 |
| `filter.external.exists` (restaurant channels only) | — | — | resy | resy and michelin (intersection) |
| `filter.hotel_class.min` (hotel channels only) | — | 3 | 4 | 5 |
| Heatmap dimensions | — | — | price_level | price_level, quality |
| Partner brands' `price_tier` | Within one step of yours (filtered in Athena's code) | Same | Same | Same |

The tier comes from evidence first (§7.2).

### 7.5 Stages

| Stage | Signal | Planning focus | Partner reach window |
|---|---|---|---|
| Pre-launch (0 accounts) | The brand (if Qloo has it), 2–5 comparable brands, and concept tags from the description; backfill allowed | The first city and the first 20 targets. The card notes that results sharpen once accounts are added. | Partners' `filter.popularity.max` = 0.97 [tune] |
| Early (1–9 accounts) | Accounts plus the brand and comparables | Deepen the first city; the pipeline and learning loop turn on | Same |
| Scaling (10+ accounts) | Accounts only (≤ 50, Qloo's pool limit), plus wins | Several metros | No cap |

The reach window keeps unreachable mega-brands and mega-shows out of an early brand's partner list.

**Which blocks use which signal (decided 8 Oct):**

| Block | Signal |
|---|---|
| Read card (fingerprint), Places, re-rank, bridges | The stage signal above: accounts once a brand has them, plus wins |
| Markets, Partners, Message, Moments | **The brand entity plus comparables**, when the brand is in Qloo; otherwise the stage signal |

**Why:** accounts describe the venues' whole crowd, which is local and broad; the brand entity describes the people who like the brand. Measured on 8 Oct with Brightland (50 resolved NYC accounts vs the Brightland entity, same everything else):

| Block | Accounts as signal | Brand as signal |
|---|---|---|
| Markets | Chicago, Atlanta, Miami, Philadelphia…; Los Angeles 10th | Los Angeles, SF Bay, Chicago, San Diego, Phoenix, Seattle, DC, Denver |
| Partners | Flour Shop, Mara Hoffman, Sweetgreen, Goop (fashion and lifestyle) | Great Jones, Standard Dose, Material, WTHN, Lake Hour |
| Moments (artists) | Raulín Rodríguez, Max B, Black Rob (New York venue crowds) | Brandi Carlile, Grace Potter, Nickel Creek, Ray LaMontagne |
| Message (references) | High Maintenance, Patti Cake$ | Chef's Table, Somebody Feed Phil, Ugly Delicious, Julie & Julia |
| Audience interests | Sales Professional, Business Professional | Cooking, Foodie, Arts Crafts, Home Organization |

Brightland's own stockist list is strongest in NYC, LA, SF Bay, Denver, Boston and Chicago, which the brand signal tracks. Places is unchanged: finding venues like your stockists is exactly what the accounts signal is for, and its 8 Oct picks were strong (Sqirl, Jon & Vinny's, Jyan Isaac Bread).

Apps and partnership-led brands have no accounts, so their signal is the brand plus comparables at every stage. Their stage only sets the reach window and the planning focus.

### 7.6 Recipes: motions → blocks

| Recipe | Motions | Blocks, in order | Draft kinds | Pipeline stages |
|---|---|---|---|---|
| R1 Stockists | venue, retail | Markets → Places (stockists) → Partners (collab brands, podcasts; also the bridge source) → Message → Moments (pop-up and sampling moments) → Act | Venue pitch (venue); buyer pitch (retail); collab inquiry | Target → Contacted → Sampling → Stocked → Reordering, or Declined |
| R2 City launch | city_launch | Markets (launch order) → Places (event venues) → Moments (launch-week events) → Partners (co-host brands, podcasts) → Message → Act | Event-venue inquiry; collab inquiry | Target → Contacted → Booked → Hosted → Rebooked, or Declined |
| R3 Partnerships | partnership | Partners (collab brands, podcasts) → Message → Moments (activation dates) → Markets (activation or pop-up city) → Places (pop-up or co-display venues) → Act | Collab inquiry; sponsorship inquiry | Target → Contacted → In talks → Live → Renewed, or Declined |
| R4 Locations (Beta) | location_opening | Markets (city shortlist) → heatmap with dimensions → Places (complementary neighbours) → Act (a site-visit route) | None | Shortlisted → Visited → Chosen |

**Evidence for every recipe:** demonstrated, through Without Qloo on Places (§10.2). R1's Places also shows the ranking check if it passes (§10.3).

**Several motions:** blocks merge in motion order, and each block appears once. The first motion's lead block opens first. Example: T1 has motions partnership and retail, so its blocks run Partners → Message → Moments → Markets → Places → Act.

### 7.7 Demo brands

Chosen on 8 Oct from key-day results (§18) [DECISION].

| Demo | Brand | Category · tier | Motions | Signal | What it shows | Why this brand |
|---|---|---|---|---|---|---|
| Goods (hero) | **Brightland** (olive oil) | G1 · premium | venue, retail | 56 resolved NYC stockists, plus the Brightland brand entity | All six blocks; NYC → Los Angeles | A Qloo brand entity; 531 independent stockists across 9 metros; 56 NYC stockists resolve; themes, references, demographics and partners tested live |
| App | **Timeleft** (dinners with strangers) | A1 · mass | city_launch | The Timeleft brand entity plus 3 comparable apps | Launch order, event venues, launch-week moments, co-host brands | Resolves in Qloo (popularity 0.45). Alternative: Meetup |
| Hardware | **Master & Dynamic** (headphones) | T1 · premium | partnership, retail | The brand entity plus comparables | Collab brands with mutual fit, podcasts, shows by the crowd's artists, a pop-up neighbourhood | Resolves in Qloo (popularity 0.85). Alternatives: Marshall Headphones, Sonos |

**Selection rules for any replacement:**
- **Goods:** a public stockist list with ≥ 20 independent stockists in each of two metros, ≥ 10 of them resolving in Qloo, and the brand entity in Qloo.
- **App and hardware:** the brand resolves in Qloo, or at least 3 comparables do. The partner list passes QA, meaning specific names rather than just famous ones, and Moments returns ≥ 3 dated items.

**Disclaimer:** real brands carry the footer "Illustrative plan from public data; not affiliated with [brand]."

---

## 8. Functional requirements

P0 is the demo path. Every requirement has a test.

| ID | Requirement | Moment | P | Done when |
|---|---|---|---|---|
| F1 | The landing page is the workspace: title, subtitle, the computed comparison line, the brand switcher with the three demo brands, *Try your own brand*, the "Try this" card, and a footer with the disclaimer and data attributions | Landing | P0 | The hero's first card line appears ≤ 3 s after load; every demo-brand block appears ≤ 5 s after load from the warm cache |
| F2 | The "Try this" card: five items pointing at real buttons, ticks, a highlight that never presses, deep links | M1–M9 | P0 | A first-time user following it reaches the Without Qloo comparison ≤ 60 s after arriving; each deep link opens the right state |
| F3 | Intake: name (required); optional website URLs (≤ 3), description, accounts (text, CSV or an image of a list), comparable brands, competitors (≤ 3), target city | M10 | P0 | 20 lines pasted from a real store locator parse into ≥ 18 correct rows; a screenshot of a 20-row list parses into ≥ 16 correct rows; a website alone yields the right category and tier for ≥ 8 of 10 test brands; a name alone produces a plan |
| F4 | Resolution of venues and brands, with ambiguity chips (§9.1) | M1, M10 | P0 | ≥ 95% precision on a hand-labelled set of 40 venues and 20 brands (venue precision measured on 8 Oct: 24 of 25 certain, 1 likely); ambiguous matches are never picked automatically |
| F5 | The "How I read your business" card: what you sell and the tier, how you grow, channels, taste signal, competitors, stage, a Tuned or Beta badge; *Looks right* and *Edit*; evidence overrides the LLM; out-of-scope businesses get a reason | M1, M9 | P0 | Every line shows evidence; an edit re-runs the blocks that depend on it; 10 test businesses across goods, tech and apps get the expected motions |
| F6 | Recipe engine: motions → blocks through one `PlaybookConfig`; the six blocks render in recipe order on one screen | M1, M9 | P0 | The three demo brands render three different block orders, with no screen built for one recipe only |
| F7 | Taste fingerprint from allow-listed tag types (§9.2) | M1 | P0 | 8 chips with source links; the allow-list test passes |
| F8 | **Markets:** metro ranking in a single call; Census population and median household income per metro; geohash heatmap; top 5 named neighbourhoods for the target metro; fly-to animation (§9.3, §9.4, §9.19) | M2 | P0 | ≥ 8 metros, each with a one-line reason and a Census line labelled "Census"; the target metro shows ≥ 3 named neighbourhoods, or "Neighbourhood names unavailable" |
| F9 | **Places:** ranked venues with template reasons; chains and closed venues removed; contact details from Qloo, else Overture, each labelled (§9.5, §9.19) | M3 | P0 | Every row has ≥ 2 evidence chips; no chain or closed venue in the top 20; every contact value has a source label |
| F10 | Venue drawer: priority, contributing accounts, shared tags, bridges, a note on other stocking factors, a draft button | M4 | P0 | Every value opens its call in the trace |
| F11 | **Partners:** ranked collab brands with mutual fit, the price-tier match and the reach window; brand websites and social links from Wikidata; podcasts with "Who listens" from Qloo Insights, and episode count, latest episode, website and contact email from Apple Podcasts; public audience figures on request, each confirmed on its page (§9.6, §9.19) | M5 | P0 | Every card has ≥ 2 evidence chips; mutual fit shows both sides; a unit test proves the min() rule; every enrichment shows its source label, and a missing one is left out |
| F12 | Bridges (shared loves) in venue drawers and drafts (§9.8) | M8 | P0 | A bridge needs ≥ 70th percentile on both sides; unit-tested |
| F13 | **Without Qloo** on Places: Gemini with Google Search grounding, no Qloo tools, the same output schema; every venue looked up in Qloo (§9.9); side by side; the comparison metrics (§10.2); Without Qloo answers for the demo brands cached with their date | M3, M6 | P0 | Every item shows its date and check status; the landing comparison line equals the metrics computed from the cached answer; Re-run respects the cap |
| F14 | Trace drawer with claim-to-call links, for Qloo and every external source; keys never shown. Every block header shows "Built from [n] Qloo calls", which opens the trace filtered to that block | M4 | P0 | Any number on screen opens its call in one click; each block's count equals the Qloo calls logged for that block in the run log |
| F15 | **Message:** themes, cultural references (TV, film, music, books), positioning against up to 3 competitors, labelled audience skew, up to 6 audience interests, 5 hooks and 5 content ideas (§9.15–9.17) | M6 | P0 | ≥ 4 themes and ≥ 6 references, or the thin label; positioning shows ≥ 2 shared and ≥ 2 distinct tags for each competitor, or explains why not; the skew chart and the interests list carry the exact label text in §9.17; a code test proves no audience outside the allow-list is ever shown; every hook passes the validator |
| F16 | **Moments:** upcoming shows by the crowd's top artists in the target metro (Ticketmaster), and taste-matched festivals with dates from a cited web source, ordered by Qloo taste rank (§9.18) | M7 | P0 | Only confirmed dated moments appear, never a "date unknown" or error row; every date shows its source and the Search Suggestions chip; every item shows its Qloo rank, and the default order follows it; demo brands' Moments load from the warm cache in ≤ 5 s; a live lookup narrates its steps and never runs past 60 s |
| F17 | Pipeline with each recipe's stage names, for venues and partners | M8 | P0 | Stage changes persist for the session |
| F18 | Two-call re-rank on outcomes over a pool of ≤ 50, for places and partners, animated, with an explanation of what moved; unscored items handled (§9.7) | M8 | P0 | Unit test: items similar to declines move down; unscored items keep their place below scored ones; the explanation names ≥ 1 shared tag |
| F19 | Drafts of every kind (venue pitch, buyer pitch, event inquiry, collab inquiry, sponsorship inquiry) from one validated template family; Copy or Open in Gmail; nothing is sent | M8 | P0 | An injected fake venue, brand or number is rejected; after 2 retries the sentence is dropped and the drop is shown |
| F20 | Field-day route for places (≤ 8 stops), Google Maps link, calendar file | M8 | P0 | The link opens in Maps with the stops in order |
| F21 | Live runs for every brand: streaming, the response cache, parallel block calls, the warm-cache job for demo brands; a labelled fallback to the brand's last live run when Qloo or the LLM fails or a cap is reached (§14.2, §14.9) | All | P0 | Demo blocks ≤ 5 s from the warm cache; an own-brand plan streams its first block ≤ 30 s and completes ≤ 120 s (median); a forced outage shows the fallback banner with its time and Retry |
| F22 | Agent rail: each tool call's reason, result and recovery; collapsible | All | P0 | Every rail line maps to an event in the log |
| F23 | Recovery ladder (§12.4) and quality gates (§9.11) | M10 | P0 | A forced-empty test shows recovery; a forced-thin test shows the "thin results" label |
| F24 | Rate limits and spend caps (§14.5), falling back to the brand's last live run | M10 | P0 | The 6th own-brand run in an hour gets a friendly message |
| F25 | Method page, Sources page, "What we don't know" page, demo disclaimer | Depth | P0 | Linked from the comparison line and the footer |
| F26 | Phone layout and a list view of the map | All | P0 | The "Try this" path completes on a 390 px wide screen |
| F27 | Ranking check (§10.3), pre-registered | Depth | P0 | Registered before any test-brand call; published whatever the result; "Ranking check: measured" appears only if it passes |
| F28 | Mood board: 4 Imagen images from the Message block (§9.21) | M6 | P1 | 4 images in ≤ 20 s; the label "AI-generated mood board" is shown; the daily image cap holds |
| F29 | Remote MCP server on Cloud Run exposing `find_markets`, `find_places`, `find_partners`, `build_message` and `find_moments` (§12.9) | — | P1 | An MCP client (e.g. Gemini CLI or Claude Desktop) gets a valid block back; the same caps apply |
| F30 | Score a list (for brokers) | — | P1 | A pasted list comes back ranked, with reasons |
| F31 | Ask the agent ("drop gyms", "brunch spots only", "where after Chicago?") | M10 | P1 | The request becomes parameter changes, shown in the rail |
| F32 | Tune the Beta recipes and categories (R4 locations, more of G4–G8, T2–T3, A2–A3) | — | P1 | Each one passes the QA checklist (§16) |
| F33 | More bridge types: podcasts, artists, TV shows | M8 | P1 | Shown as shared loves only, never as people to contact |
| F34 | "Next kind of account" card | — | P1 | Names the strongest venue type the brand isn't in yet |
| F35 | Home-city gaps | — | P1 | Names up to 3 neighbourhoods with strong taste and no accounts |
| F36 | Wins-vs-declines tag analysis from two `urn:tag` calls | M8 | P1 | Explanations cite the tag difference |
| F37 | Tier override as a scripted beat | — | P2 | Changing the tier on the card visibly changes the picks |
| F38 | Category seasonality per metro from the Google Trends API, only if the alpha application is approved | M7 | P2 | A seasonality line with its source appears for the target metro |
| F39 | One-page growth brief (print stylesheet) | — | P2 | Prints on one page from the browser |

---

## 9. Methods

Notation: **A** = accounts, **W** = wins, **D** = declines, **C** = the pool. Within one call, an item's percentile is **p = 1 − (rank − 1) / (n − 1)**. All ranking follows the rules in §9.14.

### 9.1 Resolving venues and brands

**Venues**

- **Request (verified 8 Oct):** first `GET /search?query=<cleaned name>&types=urn:entity:place&filter.address=<street>&take=5`; if nothing passes, `GET /search?query=<cleaned name>&types=urn:entity:place&filter.location=<lat>,<lon>&filter.radius=0.5&take=5` (radius in miles). Cleaning drops location suffixes such as " - Ground Floor", "(Downtown)" and "#2". Name-only search returned wrong venues and is never used.
- **Accept** a candidate when the name similarity is ≥ 0.85 (token-set ratio, after normalising "&"/"and", accents, and generic words like "coffee", "café", "bakery", "shop" and "market") **and** either the street number matches or the venue is within 150 m; **or** the names match exactly (similarity ≥ 0.99) within 300 m, because brands' locator coordinates can be off by up to about 230 m. Measured on 8 Oct: match rate 47–57%; precision 24 of 25 certain, 1 likely.
- **Two or more** candidates pass → ambiguity chips. **None** pass → unresolved: counted, listed, never guessed.
- **Chain rule:** a venue is a chain if its normalised name appears ≥ 3 times in the brand's list across cities, or it matches a maintained chain list (about 200 grocery, retail and coffee chains, matched as whole words). Chains are excluded from signals, pools and picks.
- **Cache** by normalised name and address, forever.
- **Coordinates and unmatched venues:** matched venues use Qloo's latitude and longitude. Venues Qloo can't match are looked up in the Overture place extract for their metro (§9.19), by name similarity ≥ 0.85 within 150 m of the given coordinates. If found, they appear on the map as "not in Qloo · Overture" and are never ranked. If not, they appear in the list only.

**Brands**

- **Request:** `GET /search?query=<name>&types=urn:entity:brand&take=5`.
- **Accept** the top result when its name matches after normalisation and its tags fit the category on the card. Otherwise show ambiguity chips ("Patagonia, the outdoor clothing brand?"). Comparable brands resolve the same way.

### 9.2 Taste fingerprint

- **Request:** `GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<signal>&filter.tag.types=<allow-list>&take=20`. Show the top 8 as chips grouped by type, each linked to the call.
- **Venue signals** use place tag types: ambience, setting, good-for, decor, cuisine, dining options, menu highlights, specialty dishes, amenities and service options.
- **Brand signals** use cross-domain taste tags: genre tags (music, media, places, brands), media keywords, and brand style and personality.
- **Never shown or stored:** `customer_identity`, `neighborhood_characteristic`, any audience family, Wikipedia categories, or anything political or religious. Demographics come only from `urn:demographics` under §9.17. The allow-list is a code constant with a test. Several values in `filter.tag.types` work in one call (8 Oct); results are also filtered by `subtype` in code before anything is stored or shown.

### 9.3 Markets

- **Request:** `GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<signal>&filter.tags=<placeChannels>&diversify.by=properties.geocode.metro&diversify.take=4&take=50&filter.exclude.location.query=<home metro>`, plus the tier parameters.
- **Ranking:** Qloo returns metro groups ranked by their best venue. Every metro is scored inside this one call, so the comparison is valid. The reason line names each metro's strongest match.
- **Filtering:** only the 25 largest US metros (a config list) are shown. Other metros where the brand already has accounts are removed in Athena's code.
- **Per recipe:** for R2 the list is the launch order, for R3 it picks the activation or pop-up city, and for R4 it's the shortlist.
- **Verified 8 Oct:** 14 metros returned for the tuning brand.
- **Market size:** each metro row adds a Census line (§9.19): population and median household income, labelled "Census, ACS 2020–2024". Census values never change the order.

### 9.4 Heatmap and neighbourhoods

- **Map layer:** `filter.type=urn:heatmap&filter.location.query=<metro>&signal.interests.entities=<signal>` returns geohash cells, each decoded to a rectangle.
  - **Colour = `affinity_rank`**, which shows where this crowd's taste is stronger than elsewhere [VERIFY its direction].
  - **Opacity = `popularity`.**
  - Legend: "Brighter means more of your crowd's taste than elsewhere."
- **Neighbourhood names (Overture, §9.19):** Qloo's `output.heatmap.boundary=urn:entity:locality` returned HTTP 500 on 8 Oct, so names come from Overture neighbourhood polygons. Each geohash cell's centre is assigned to the polygon that contains it. A neighbourhood's score is the mean `affinity_rank` of its cells, counting only neighbourhoods with ≥ 3 cells. The top 5 are listed as "Logan Square · 7 cells" (*illustrative*), labelled "Taste: Qloo · Names: Overture". If the metro has no Overture neighbourhoods, the list says "Neighbourhood names unavailable".
- **Premium and luxury tiers, and R4,** add `heatmap.dimensions=price_level` (plus `quality` for luxury) to show where higher-priced venues match.

### 9.5 Places

- **Request:** `GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<signal ∪ W>&filter.location.query=<metro or neighbourhood>&filter.tags=<placeChannels>&operator.filter.tags=union&filter.exclude.entities=<exclude>&feature.explainability=true&take=50`, sent with `page=1` and `page=2`, plus the tier parameters and `bias.content_based` (frozen from tuning).
- **Channels per recipe:**
  - R1: the category's stockist venue types.
  - R2: event venues: cafés, brunch spots, art galleries and parks*, with group-friendly setting and good-for tags.
  - R3: pop-up and co-display venues: art galleries, coffee shops and gift shops (concept-store tags don't exist in Qloo, §7.3).
  - R4: complementary neighbours near candidate sites.
- **Post-filter:** remove chains and venues with `is_closed`. The picks are the first 20 that remain (R1 shows up to 50 on "Show more"). The first 50 results form the pool C (Qloo's `take` maximum is 50).
- **Reasons are templates filled from Qloo fields, not LLM text:**
  1. "Like your [account] and [account]": the top contributors in `query.explainability` (≥ 0.1).
  2. "Shared: [tag], [tag]": the venue's tags that also appear in the fingerprint.
  3. "Crowd growing": `query.measurements.audience_growth` > 0 (present on places, 8 Oct).
  4. "Price fits": `price_level` inside the tier range.
- **Display:** the UI shows ranks. Affinity decimals stay in the trace.
- **Contact details:** phone and website from Qloo `properties`; if missing, from the venue's Overture record (§9.19), each labelled with its source.

### 9.6 Partners

**Brand partners**

- **Request:** `GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<signal>&filter.exclude.entities=<own brand, competitors>&take=50`, plus the reach window from §7.5 (`filter.popularity.max`).
- **Filters in Athena's code:** keep brands whose `price_tier` is within one step of yours. Remove direct competitors: brands that share your narrowest genre tag (Brightland's is `urn:tag:genre:brand:food_and_beverage:food:condiments_and_spices`, 8 Oct), and any the user lists.
- **Enrichment:** official website and social handles from Wikidata (§9.19), when Qloo's `external` field carries a Wikidata ID.

**Podcast partners**

- **Request:** `GET /v2/insights?filter.type=urn:entity:podcast&signal.interests.entities=<signal>&take=20`, plus the same reach window.
- **Enrichment:** episode count, latest episode date, genre and Apple Podcasts link from Apple's lookup, keyed by the Apple ID in Qloo's `external` field; website and contact email from the show's RSS feed (§9.19). Qloo's `episode_count` isn't shown: it was "15" for every podcast on 8 Oct. A podcast with no episode in 60 days is marked "no new episode in 2+ months"; enrichments never change the order. Hosting relay addresses (`info+<id>@mg-eu.acast.com`) aren't shown as contacts.

**Who listens (top 5 podcasts), based on Qloo Insights**

Five Qloo calls per podcast, with the show itself as the signal:
- **Skew:** `filter.type=urn:demographics`. Gender and age are named only at |value| ≥ 0.30, and an age bucket only when it leads the next by ≥ 0.15 (Fat Mascara scored 0.86 for "24 and under" and 0.78 for "55+" on 8 Oct, so no age is named). Labelled "a skew, not a head count".
- **They also love / they watch:** the show's top brands (`take=50`, minus you and your competitors) and top TV shows. Music isn't shown: on 8 Oct it returned Polish pop for a US beauty show. Qloo's audience types came back empty for podcasts.
- **Common ground:** your crowd scored over the show's top brands; bridges as in §9.8 (min of both percentiles ≥ 0.70, top 2). This is the ad-read angle.
- **How they rate you:** your rank among the mutual-fit peer set with the show as the signal (8 Oct, Brightland: #2 to #15 of 15 across its top podcasts).

**Public audience numbers (on request)**

- One button per podcast: Gemini 3.1 Pro with Search and URL context is given today's date and what Qloo knows about the show (description, Apple ID, Instagram handle), told to search and then open each page it cites, and asked for stated figures only, one line each: figure, date, URL. Without the date and "search first", Gemini answered from memory on 9 Oct (no searches, invented URLs); with them it ran 8–10 searches per show.
- **Pro, not Flash.** On 9 Oct Pro never returned Google's grounding sources for this prompt (it does for festival dates), so the URLs it writes are its own and often 404. Flash returned the sources but took 140–250 s with Search, against 15–40 s for Pro. When Google does send sources, Athena follows each one to its real page and checks the figure there too.
- **Every figure is confirmed on its page.** Athena opens each cited page (https and public hosts only, redirects re-checked) and keeps a figure only if the page shows the number, in any of its written forms ("33K", "33,000"), within 200 characters before or 1,000 after the show's name, so a list page naming many shows can't easily lend one show's figure to another. (Directory pages such as Feedspot put the name, then a description, then the stats: 738 characters apart on 9 Oct. A number in the next show's entry within 1,000 characters would still pass.) A sponsor or advertising page counts only if it's the show's own: on the show's website (from its RSS feed) or with the show's name in the URL. On 9 Oct Gemini returned no grounding sources for these answers and invented two URLs (both 404), and Muck Rack blocks automated visitors, so its estimates are dropped.
- A figure must say what it counts; bare numbers are dropped. Each keeps its date ("undated" when the page gives none) and is marked "may be out of date" when older than last year (Forever35's "125,000 downloads a week" is from 2019). Third-party estimators are labelled "estimate by …". Sponsor and advertising pages are listed first.
- Answer lines whose labels Gemini formats in markdown (`**FIGURE:**`) still parse.
- With nothing confirmed, the card says podcasts usually share numbers in a media kit, with the show's contact email. Never "not found".
- Tested 9 Oct after these fixes: Fat Mascara "over 13 million downloads" (Glossy, March 2026); Breaking Beauty #23 in US Fashion & Beauty (reason.fm, Sept 2026); Forever35 its advertising contact only; It's Me, Tinx nothing confirmed. The misses were 404 links Gemini wrote and estimators that block automated visitors (Muck Rack, Rephonic).
- The server log records each search's queries, raw answer, token use and why each figure was kept or dropped.
- Results vary between runs (9 Oct: Fat Mascara got a confirmed figure on one run and none on the next), so when nothing is confirmed Athena searches once more ("Nothing confirmed yet; searching once more").
- About 30 s, or about a minute with the second search, narrated from Gemini's thought summaries. Confirmed figures are kept with no expiry, so the next click on that show is instant and free, and each figure shows the date it was confirmed. **Search again** runs a new search: newly confirmed figures replace kept ones of the same kind (newer downloads replace older downloads), other kinds stay, and if it confirms nothing the kept figures stay, marked "searched again <date>, nothing newer". An empty or timed-out result is never kept, so the next click searches again. Lines whose labels Gemini formats in markdown still parse. 60 searches a day (§14.5); each search counts, so a click uses one or two. This is a lead for the founder, never a ranking input.

**Reasons:** the top explainability contributors (when the signal has several entities), tags shared with the fingerprint, and the price tier.

**Mutual fit (brands only)**

1. **Peer set P, built once per plan:** your brand plus 14 peers, taken from brand recommendations for your brand filtered to your narrowest genre tag.
2. **Forward:** the partner's percentile in your partner call, p_fwd.
3. **Reverse:** `GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<partner>&filter.results.entities=<P>`. Your rank among the 15 gives p_rev.
4. **Mutual fit = min(p_fwd, p_rev).** The card shows both sides: "You → them: 91st percentile · Them → you: #3 of 15 brands like you."

Mutual fit is computed when a card opens, and precomputed for the demo brands. It needs your brand to be in Qloo; otherwise the card shows the forward side only, labelled as such.

In R1, the Partners list also supplies the brands used for bridges (§9.8).

### 9.7 The learning loop

Qloo has no negative signal, and raw scores from different calls aren't comparable. Ranks over the same fixed pool are comparable. This works the same way for venues and partners.

- **Re-rank (up to 2 calls on every outcome change):**
  - Fit: the signal plus W, with `filter.results.entities=C` (≤ 50 IDs), giving p_fit.
  - Decline (only when D isn't empty): signal D, with `filter.results.entities=C`, giving p_dec.
  - **score = p_fit − λ · p_dec**, with λ = 0.5 [DECISION]. Ties are broken by p_fit.
  - **Unscored items** (about a third of a 50-venue pool on 8 Oct) get no p_fit. They keep their previous relative order, sit below every scored item, and show "no taste score". An item unscored in the decline call gets p_dec = 0.
- **Refresh (after 3 new wins, or on demand):** re-run the block's main call with the new signal (2 calls for Places, 1 for Partners). New entrants are marked "new".
- **Explanations:** for each item that moves 5 or more places, list the tags it shares with the wins (it moved up) or with the declines (it moved down), taken from the items' own tags. Example: "Moved down: resembles your declines (quick-service, takeaway-only)."
- **Pipeline effects:** won items move to the recipe's success stage and leave the list. Declined items leave it and stay excluded.
- **Motion:** the re-order animates over 400 ms with a "What changed" note.

### 9.8 Bridges ("shared loves")

- **Brand set, once per plan:** the R1 Partners call (§9.6), giving p_acc. On 8 Oct, venue signals returned mostly lifestyle brands (Madewell, Goop, Warby Parker), which are valid shared loves.
- **Per venue v,** when its drawer opens or a draft is written: `filter.type=urn:entity:brand&signal.interests.entities=<v>&filter.results.entities=<brand set>`, giving p_v.
- **bridge(v, b) = min(p_acc(b), p_v(b)).** Show the top 2 bridges with a value of at least 0.70. Otherwise there's no bridge, and the draft opens with shared tags instead.
- **UI:** a two-sided bar for each bridge: "Your accounts' crowd: 92nd percentile · This venue's crowd: 85th."
- **Copy:** "Crowds like yours and ours both over-index on X and Y." Never "your customers love".
- **Cost:** 1 call per venue whose drawer is opened or drafted (cached; at most 10 per session).

### 9.9 Without Qloo

- **Scope (v2.11): Places only.** On Partners, Message and Moments there is no outside check: taste fit would be scored by Qloo itself, themes and hooks can't be scored, and Athena's own festival dates also come from Gemini with Search. Each would cost a slow grounded call for a weak point.
- **Setup:** Gemini 3.1 Pro on Vertex AI with **Grounding with Google Search on and no Qloo tools**, given the same business card and the same output schema (Appendix B, `llm_only`). It names 20 venues in the target metro.
- **Checking:** every venue is looked up with Qloo `/search` within 40 miles of the metro and marked:
  - **found:** shown with its Qloo popularity percentile, and Athena's rank if it's in Athena's pool;
  - **closed:** Qloo has it with `is_closed`;
  - **unverified**, shown as **"couldn't verify":** Qloo has no match nearby. The UI says this doesn't mean the place is made up. Never "fake" or "dead".
- **Framing:** the comparison is labelled "demonstrated, not measured" and links to the ranking check (§10.3) as the independent test.
- **Metrics:** computed as in §10.2 and shown under each comparison.
- **Labels:** every comparison metric is "demonstrated".
- **Map:** chatbot venues are triangles; unverified ones are dashed.
- **Cost control:** the demo brands' Without Qloo answers are cached with their date. Re-runs and comparisons for other brands are capped (§14.5).

### 9.10 Grounding validator

- **Schema:** every LLM output that reaches the UI (drafts, the card's lines, Message tone lines and hooks, rail lines that name entities) lists the claims in each sentence: `{kind: venue | account | brand | podcast | tag | theme | reference | event | number, ref, value?}`.
- **Checks:** each `ref` must exist in this run's evidence store, and each number must match its evidence after rounding. A proper-noun scan rejects capitalised names that aren't on the run's whitelist (venues, accounts, brands, podcasts, metros, neighbourhoods and the user's own brand).
- **On failure:** the violations go back to the agent. After 2 retries, the sentence (or the whole draft) is dropped, and the UI says "1 sentence removed: not supported by the evidence."
- **Test:** a draft that mentions "Fake Café 99" or a made-up number is rejected.

### 9.11 Quality gates and Beta

- **Thin thresholds, after recovery:** Markets with fewer than 5 metros; Places with fewer than 15 venues; Partners with fewer than 8 entries; Message with fewer than 4 themes or 6 references. (Moments has no thin label: it shows only confirmed dated moments, §9.18.) A thin block shows what it has under "Thin results: [reason]". It's never padded.
- **Beta categories:** the card shows "Beta: not tuned yet; results may be thinner."
- **Tuned** means the category's venue types passed S3, and the QA checklist (§16) passed on 2 brands.
- **Out of scope:** a one-line reason, plus the demo cards.

### 9.12 Field-day route (Places only)

Order the stops by nearest neighbour from the starting point, then improve with 2-opt, for up to 8 stops [VERIFY the Google Maps URL waypoint limit]. Outputs:

- a Google Maps directions URL (walking, transit or driving);
- an `.ics` file with 30-minute visits plus travel time estimated from distance.

### 9.13 P1 extras

- **Next kind of account (F34):** run the §9.5 call without the channel filter, group the top 50 by place genre tag, and name the strongest type the brand has no accounts in: "Beyond cafés, your crowd's strongest match is wellness studios: 9 of the top 50."
- **Home-city gaps (F35):** show the home metro's heatmap with the accounts pinned on top. Cells in the top tenth by `affinity_rank` with no account within 500 m are gaps, named through the Overture neighbourhoods (§9.4).
- **Beta tuning (F32):** each recipe or category that passes the QA checklist loses its Beta badge.

### 9.14 Ranking discipline (enforced by tests and code review)

1. Never compare raw affinity scores across calls.
2. Compare across calls only through percentiles over the same candidate set (`filter.results.entities` or `filter.results.tags`, ≤ 50 items). Bridges, mutual fit, positioning, the re-rank and the ranking check all work this way.
3. Show ranks; decimals stay in the trace.
4. Results are a "taste match" and a "priority to approach". Never "will stock", "predicts" or "likely to buy".
5. Enrichments (Census, Overture, Ticketmaster, Apple Podcasts, Wikidata, Web) never change an order. They attach facts to items Qloo already ranked.

### 9.15 Message: themes, references, hooks

All requests use the plan's signal (accounts, or the brand plus comparables). Each block element is labelled with its source.

- **Themes** (Qloo, Q13): `GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<signal>&filter.tag.types=urn:tag:theme:qloo&take=10`.
  - Show the top 6 as chips.
  - Under them, one Agent-written line of tone guidance that may cite only those themes, checked by the validator (§9.10).
- **Style tags** (Qloo, Q4): the fingerprint's brand-style and adjective tags, when the signal includes a brand entity.
- **Cultural references** (Qloo, Q14): one call each for `urn:entity:tv_show`, `urn:entity:movie`, `urn:entity:artist` and `urn:entity:book`, with `take=5` and `filter.popularity.max=0.99`, so the list isn't just the most famous titles.
  - Show the top 3 of each type, with their rank.
  - Artists carry the note "a cultural reference, not a contact".
- **Hooks and content ideas** (Agent): Gemini 3.8 Flash writes 5 hooks (≤ 12 words each) and 5 content ideas (≤ 25 words each).
  - It may use only the themes, style tags, references, shared loves (§9.8) and positioning (§9.16) in this run's evidence store.
  - Every hook lists its claims, and the validator rejects any claim not in the evidence store.
  - Claims are never about the brand's customers as people ("people who love X…" is allowed; "your customers are…" is not).
- **Calls:** 5 Qloo calls (1 tag call and 4 reference calls), plus 1 LLM call.

### 9.16 Positioning (shared-pool method)

Qloo's `/v2/analysis/compare` returned tags for Lululemon vs Patagonia but **nothing for Brightland**, even against Lululemon (8 Oct). So positioning uses fixed tag pools, which are comparable across calls (§9.14).

1. **Competitors:** up to 3, either named by the user and resolved as brands (Q2), or the top 2 peers from the mutual-fit peer set (Q10). Competitors without a Qloo brand entity use their resolved stockists as the signal, if given.
2. **Candidate tags:** for the brand and each competitor, the top 15 tags of types `urn:tag:theme:qloo` and the brand-style family (Q13, Q4).
3. **Pool:** the union of candidate tags, capped at 50 (Qloo's `take` limit), keeping the highest-ranked first.
4. **Scoring:** one call per brand, `filter.type=urn:tag&signal.interests.entities=<that brand's signal>&filter.results.tags=<pool>&take=50`. Each tag's percentile within that call is p = 1 − (rank − 1)/(n − 1). Unscored tags get p = 0.
5. **Classification, per competitor:**
   - **Shared:** both p ≥ 0.70.
   - **Only you:** yours ≥ 0.70 and theirs ≤ 0.40.
   - **Only them:** theirs ≥ 0.70 and yours ≤ 0.40.
6. **Display:** for each competitor, up to 3 tags in each class, as "Shared: Modern, Minimalist · Only you: Authenticity · Only them: Performance" (*illustrative*). A class with no tags says "none found".
7. **Calls:** 1 + number of competitors for the candidate tags, plus 1 + number of competitors for scoring. At most 8 calls.

Measured on 8 Oct: Brightland and MUD\WTR scored 26 and 24 of a 30-tag pool.

### 9.17 Audience skew and audience interests (aggregate)

- **Request** (Qloo, Q16): `GET /v2/insights?filter.type=urn:demographics&signal.interests.entities=<signal>`. The response gives `query.age` for `24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54` and `55_and_older`, and `query.gender` for `male` and `female`. Positive values mean above-average affinity; negative values mean below.
- **Display:** a diverging bar chart with one bar per age bucket and one per gender, centred on zero, with no decimals; the bars are labelled "over-indexes" or "under-indexes". Only aggregate values are shown.
- **Fixed label text, always shown:** "Aggregate taste-panel signal from Qloo, relative to average. It describes people who share this taste, not your customers. Not for targeting."
- **Hidden when weak:** if every value is between −0.10 and 0.10, the chart is replaced by "No clear skew".
- **Never used for:** ranking, filtering, recipe choice, draft text or ad targeting. Hooks (§9.15) can't cite it. A code test checks that no request parameter is ever built from these values.

**Audience interests** (Qloo, Q20)
- **Request:** `GET /v2/insights?filter.type=urn:audience&signal.interests.entities=<signal>&take=50`. Each result has `name`, `entity_id`, `disambiguation` and `query.affinity`.
- **Allow-list (a code constant with a test):** keep a result only if its audience type, looked up from `/v2/audiences?filter.audience.types=<type>` (cached forever), is one of `urn:audience:hobbies_and_interests`, `urn:audience:leisure`, `urn:audience:spending_habits` or `urn:audience:professional_area`.
- **Never shown or stored:** `urn:audience:communities`, `urn:audience:political_preferences`, `urn:audience:lifestyle_preferences_beliefs`, `urn:audience:global_issues`, `urn:audience:life_stage` and `urn:audience:investing_interests`. On 8 Oct, Brightland's unfiltered top 10 included Latino, LGBTQ, Spirituality and Politically Progressive; all of them are removed by this rule.
- **Display:** the top 6 allowed audiences as chips, in affinity order, under the heading "Interests your crowd over-indexes on", with the same fixed label text as the skew chart.
- **Hidden when thin:** fewer than 3 allowed audiences shows nothing.
- **Allowed uses:** a hook or content idea may cite an interest ("for people who love cooking…"), checked by the validator (§9.10).
- **Never used for:** ranking, filtering, recipe choice or ad targeting. A code test checks that no request parameter is ever built from an audience. (On 8 Oct, `signal.demographics.audiences` changed 0 of the top 20 venues, so it wouldn't help ranking anyway.)
- **No per-metro version:** adding `filter.location.query=Chicago` returned the same top 5 as the national list (8 Oct), so interests are shown once per brand, not per city.
- **Calls:** 1 Qloo call, plus the cached type lookups.

### 9.18 Moments: when and where to show up

Qloo's timing sources were all empty on the hackathon endpoint on 8 Oct: `/v2/trending`, the locality month tags, and audience growth on non-place types. So Moments joins **Qloo-ranked taste** to **dated events from outside sources**. It runs only when a user opens the block, as Ticketmaster's terms expect.

**Shows** (Qloo, then Ticketmaster)
1. Artists: `GET /v2/insights?filter.type=urn:entity:artist&signal.interests.entities=<signal>&take=15`, keeping the top 10.
2. For each artist: Ticketmaster Discovery `GET /discovery/v2/events.json?keyword=<artist name>&classificationName=music&dmaId=<target metro's DMA>&startDateTime=<now>&endDateTime=<now + 120 days>&size=5&apikey=<key>`.
3. Keep an event only if one of its `_embedded.attractions[].name` matches the artist's name after normalisation (similarity ≥ 0.95).
4. Show up to 6 events: "[Artist] · your crowd's #[rank] artist · [date] · [venue] · Tickets ↗ (Ticketmaster)".
5. Cache 24 hours. At most 10 Ticketmaster calls per open, and 5,000 a day in total (§14.5).

**Festivals** (Qloo, then Web)
1. Festivals: `GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<signal>&filter.tags=urn:tag:genre:place:festival&filter.location.query=<target metro>&take=10`. On 8 Oct this returned 4 for Brightland in Chicago (Do Division Street Fest, Andersonville Midsommarfest, Jack's Big City Ranch, Edison Park Fest) and 6 in Los Angeles.
2. **Date lookup, per festival, in Qloo rank order, 4 at a time, until 5 are dated:** one streamed call (`streamGenerateContent`) to `gemini-3.1-pro-preview` with thinking LOW, `includeThoughts: true`, temperature 1.0, and two tools: Grounding with Google Search and URL context. The model replies in one line: `DATE: <date exactly as the page writes it> | URL: <that page's URL>`, or "No date found".
3. **A date is kept only when all three hold:** the cited page's domain is one of the grounding sources returned; the quoted text parses to a full date (month and day; a missing year means the next occurrence); and that date is within the next 12 months. A date is never guessed.
4. **Time limit:** 60 s per lookup. A lookup that times out, errors or can't be confirmed simply leaves that festival out, and the next festival in rank order is checked.
5. Show: "[Festival] · festival taste match #[rank] · [date] · Source: [site] ↗ (Web)", with Google's **Search Suggestions** chip (the response's `searchEntryPoint.renderedContent`, shown unmodified in a sandboxed frame). Google's grounding terms require the chip wherever a grounded result is shown.
6. **Caching:** a confirmed date is kept until it passes (re-checked within 7 days); a miss is retried after 1 hour. At most 150 grounded lookups a day (§14.5).
7. **Demo brands (A):** the warm-cache job (§14.9) runs these lookups ahead of time, so judges see dated festivals instantly. **Every other brand (B):** lookups run live, and the block streams.

**Measured on 8 Oct (Brightland, Los Angeles festivals):**

| Setup | Time per lookup | Result |
|---|---|---|
| `gemini-3.8-flash`, Search, default thinking | 77–108 s | Correct, but too slow |
| `gemini-3.1-flash-lite`, thinking MINIMAL | 3.6 s | Missed the nearest date (said May 2027 when Dec 13–14, 2026 existed) |
| `gemini-3.1-pro-preview`, thinking LOW, Search only | 12–18 s | Correct answers, but grounding sources returned on only 2 of 6; none at all when the answer was bare JSON |
| `gemini-3.1-pro-preview`, thinking LOW, **Search + URL context** | 17–56 s | Sources returned on every completed answer; Topanga Vintage Market Oct 25, 2026 (topangavintagemarket.com), Unique LA Dec 13–14, 2026 (vendorsmap.com) |

Gemini 3 bills each search query the model generates; a lookup made 2–12 queries.

**Progress, never a blank wait:** while lookups run, the rail shows each step from the model's streamed thought summaries ("Searching event dates", "Confirming market dates"), and the Moments view lists each festival being checked with its current step.

- **Category seasonality** (F38, P2) comes only from the Google Trends API, if the alpha application is approved.
- **Calls:** 2 Qloo calls, ≤ 10 Ticketmaster calls and ≤ 10 grounded lookups per open (fewer when 5 festivals are dated early).

### 9.19 Enrichments

Enrichments attach facts to Qloo results or fill Qloo gaps. They never change an order.

| Enrichment | Request | Joined on | Cached | Shown as |
|---|---|---|---|---|
| **Census market size** | `GET https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area:<CBSA>&key=<key>` | The metro's CBSA code (a config table for the 25 metros) | Permanently | "Population 13.0M · Median household income $X · Census, ACS 2020–2024" (*illustrative*) |
| **Overture neighbourhoods** | BigQuery: Overture division areas with subtype `neighborhood` (or `macrohood`) inside the metro's bounding box; table names [VERIFY S18] | Geohash cell centre, by point-in-polygon | Firestore, permanently (one extraction per metro) | Neighbourhood names in Markets (§9.4) |
| **Overture venues** | BigQuery: Overture places inside the metro's bounding box, keeping name, coordinates, categories, phones, websites and operating status | Name similarity ≥ 0.85 and ≤ 150 m | Firestore, permanently (one extraction per metro) | Unmatched accounts on the map; contact fallback for picks, labelled "Overture" |
| **Apple Podcasts** | `GET https://itunes.apple.com/lookup?id=<Apple ID>`, then the first part of the show's `feedUrl` (up to the first `<item>`) | The Apple ID in Qloo's `external.itunes` | 1 day (Apple asks large sites to cache) | "755 episodes · latest 7 Oct 2026 · Fashion & Beauty · Apple Podcasts" (Fat Mascara, 8 Oct) |
| **Wikidata** | `GET https://www.wikidata.org/w/api.php?action=wbgetentities&ids=<QID>&props=claims&format=json`, with a descriptive User-Agent | The Wikidata ID in Qloo's `external` field | 7 days | "Website ↗ · Instagram ↗ · X ↗ · Wikidata"; properties P856, P2003 and P2002 |
| **Ticketmaster** | §9.18 | Artist name | 24 hours | §9.18 |
| **Web dates** | §9.18 | Festival name | 24 hours | §9.18 |

- **Overture extraction cost control:** each metro is extracted once, filtered by bounding box with only the needed columns selected, so each query stays inside the 1 TB-a-month BigQuery free tier. The scan size is checked in S18.
- **Missing values** show "not found". Nothing is inferred.

### 9.20 Reading a website (onboarding)

- **Input:** up to 3 URLs the user types (home, about, store locator). Only `https` URLs on public hostnames are accepted. IP addresses, `localhost` and private ranges are rejected before the call.
- **Call:** Gemini 3.8 Flash on Vertex with the **URL context** tool and these URLs. **Athena's own server never fetches the pages.**
- **Output schema:** `{category, tier, products[≤5], description ≤ 160 chars, stockists[{name, address, city}] ≤ 50, competitors_mentioned[≤3]}`.
- **Safety:**
  - Page text is data, never instructions. The system prompt says so, and the schema allows no free-form instructions.
  - Every field is shown on the card for the user to confirm.
  - Stockists go through normal resolution (§9.1).
- **Fallback:** if the pages can't be read (for example, a JavaScript-only store locator), the card asks for a description, and the store list can be pasted instead.
- **Cost:** page content is billed as input tokens, from the credit.

### 9.21 Mood board (P1)

- **Call:** Imagen 4 Fast on Vertex, 4 images per plan, 1:1, generated on request only.
- **Prompt:** built only from the Message block's top 3 themes, top style tags and setting tags, as "a styled product mood board evoking [themes], [style] aesthetic, [setting] setting, no text, no logos, no people's faces".
- **Never in the prompt:** brand names, logos, real people or artists.
- **Label:** "AI-generated mood board (Imagen) from your crowd's taste themes."
- **Caps:** 20 images a day in total ($0.40 a day at most); demo brands' boards are generated once and cached.

---

## 10. Evidence and proof

Athena makes one kind of claim per block: **demonstrated** (shown with evidence and compared with a chatbot) or **measured** (checked against ground truth under a pre-registered rule). Only the ranking check in §10.3 can earn "measured".

### 10.1 The stockist blind test: run on 8 Oct, failed

**Setup (tuning brand only).**
- **Brand:** Brightland. Its public list has 108 independent stockists in the New York metro and 87 in the Los Angeles metro.
- **Signal:** 56 resolved, open NYC stockists.
- **Ranking:** Los Angeles venues of the channel types, chains and closed venues removed.
- **Picks:** the top 50.
- **Baseline:** the same call without a signal, which Qloo ranks by popularity.
- **Scoring:** hits counted against all 87 hidden LA independents, resolved or not.

**Results (measured on 8 Oct)**

| Variant | Athena hits in top 50 | Most popular hits in top 50 |
|---|---|---|
| PRD G1 channels, `filter.location.query=Los Angeles` | 1 of 87 | 0 |
| Data-derived channels (gift, home goods, grocers, cafés, bakeries, cheese), same location | 1 | 0 |
| Retail-only channels | 1 | 1 |
| Data-derived channels + price level 2–4 | 1 | 1 |
| Data-derived channels + `bias.content_based` 0.2 / 0.8 | 1 / 0 | 0 / 0 |
| Metro-wide (`POINT(-118.30 34.03)`, radius 55 km), data-derived channels | 1 | 0 |
| Metro-wide, retail-only, top 105 picks | 1 | 0 |

**Diagnosis**
1. **Coverage.** Qloo has 47% of Brightland's LA independents and 52% of its NYC independents. A sample of 40 Fishwife NYC stockists matched at 57%. The missing venues are mostly tiny boutiques.
2. **Geography.** `filter.location.query=Los Angeles` covers only 10 of the 38 resolved LA stockists. A 55 km radius fixes this, but the hit count didn't change.
3. **Haystack.** Each metro holds thousands of venues of these types; a top-50 list is too small for the strength of the signal.
4. **Signal.** Scored in the same call against same-type decoys, real stockists ranked higher 61% of the time (0.69 and 0.53 in two batches; 0.5 is chance). But only 12 of 38 real stockists were scored at all.

**Decision.** The v2.4 kill switch is executed. Athena makes **no hit-count claims**. The Method page publishes this table and the diagnosis in full.

### 10.2 Headline evidence: With Qloo vs Without Qloo (demonstrated)

For every demo brand, the Places question is answered twice:
- **Athena**, using Qloo.
- **Without Qloo**: the LLM with Google Search grounding and no Qloo tools (§9.9).

Both answers use the same output schema. Each chatbot item is checked, and the block shows these metrics, computed from the two answers:

| Metric | Computed as | Blocks |
|---|---|---|
| **Couldn't verify or closed** | Share of chatbot venues that §9.1 marks *unverified* (shown as "couldn't verify") or *closed* | Places |
| **Most obvious** | Share of chatbot picks that resolve in Qloo with `popularity` ≥ 0.95, beside the same share for Athena's picks | Places |
| **Median popularity** | Median Qloo popularity percentile of found picks, chatbot vs Athena | Places |
| **Evidence** | Share of picks with ≥ 2 Qloo evidence chips. Athena's must be 100%; the chatbot's is 0% by construction, because it has no Qloo access. Shown so the difference is explicit | Places |
| **Taste fit of the chatbot's picks** | The chatbot's found venues scored in one call against Athena's signal, with `filter.results.entities` = Athena's top 25 + the chatbot's found venues (≤ 50); reported as the chatbot picks' median rank in that pool | Places |

**First live run (Brightland, Los Angeles, 8 Oct; `gemini-3.1-pro-preview` with Google Search):**

| Metric | Chatbot | Athena |
|---|---|---|
| Couldn't verify or closed | 15% (2 closed, 1 couldn't verify, of 20) | 0% (removed by rule) |
| Most obvious (Qloo popularity ≥ 0.95) | 27% of found | 35% |
| Evidence (≥ 2 Qloo chips) | 0% | 100% |
| Taste fit: chatbot's found venues in one pool of 37 with Athena's top 25 | median rank #29 | — |

The chatbot's list was credible (Joan's on Third, Cookbook Market, Gjusta, Milkfarm), so the baseline is not a straw man. Athena's edge is taste fit, evidence and no unverified picks; it is not "less obvious" on this brand. Taste fit is scored by Qloo itself, so this table illustrates the difference; the ranking check (§10.3) is the independent test.

Rules:
- **Every metric is labelled "demonstrated".** None is an accuracy claim.
- **The demo brands' Without Qloo answers are cached with their date** and re-run at most 10 times a day in total (§14.5).
- **The landing comparison line** (§2.2) is filled only from these computed values.

### 10.3 Ranking check (measured, P0)

The one measured claim. It tests whether Athena ranks a brand's real stockists above look-alike venues of the same types, in a fair pool.

**Pre-registration.** Before the first call on any test brand, commit `proof/REGISTRATION.md` and tag it `prereg-v2`. It fixes everything below, plus the decoy seed, and a commitment to publish every result.

**Test brands** [DECISION]: three brands from `proof/stockists/` other than Brightland, one per category where possible:
- Fishwife (G1);
- Rishi Tea or MUD\WTR (G2);
- Paddywax (G4).

Each must have ≥ 25 resolved, open, independent stockists in metro B.

**Procedure, per test brand**
1. **Signal:** all resolved, open, independent stockists in metro A (≤ 50 IDs). Metro A and metro B are the two metros with the most independents.
2. **Pool (exactly 50):**
   - 25 resolved, open, independent stockists in metro B, chosen at random with the registered seed if there are more than 25;
   - 25 decoys: venues inside a 55 km radius of metro B's centre, carrying the same `urn:tag:genre:place` tags as the stockists, not on the brand's list, sampled with the registered seed from pages 1–5 of the no-signal ranking.
3. **One call:** `filter.type=urn:entity:place`, `signal.interests.entities=<signal>`, `filter.results.entities=<pool>`, `take=50`.
4. **Athena's order:** the order returned. Unscored pool members are tied, below every scored member.
5. **Baseline order:** the same pool sorted by each entity's Qloo `popularity`.
6. **Metric:** AUC, meaning the probability that a random stockist ranks above a random decoy, over all 25 × 25 pairs. Ties count as 0.5. Also report the share of the pool that was scored.

**Pass rule:** on at least 2 of 3 test brands, Athena's AUC ≥ 0.60, **and** Athena's AUC minus the baseline AUC is ≥ 0.05.

**Before registering:** compute the same metric on Brightland, the tuning brand, and publish it as tuning data. On 8 Oct an earlier version of this measure gave 0.61 on scored pairs only; the registered version counts unscored items, so expect it to come out lower.

**If it passes:** Places shows "Ranking check: measured · AUC [x] vs popularity [y] on [n] of 3 brands", linked to the Method page. **If it fails:** the Method page publishes the result, and nothing on Places says "measured".

### 10.4 What isn't measured

Markets, Partners, Message and Moments have no ground truth we can test before judging. They're shown with their Qloo evidence chips, a line saying how each was ranked, and the calls that built them, and labelled "demonstrated".

### 10.5 Reporting

Every brand, every metric, raw counts, coverage (match rate, share scored) and caveats go on the Method page and in the README. Nothing is omitted because it looks bad.

---

## 11. Data sources

Qloo is the only source that ranks anything. Every other source either fills a gap the key-day spike proved (§18) or attaches a fact to a Qloo result. Only our server calls any source; the browser never does.

### 11.1 Qloo (the core)

Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key` (from Secret Manager, §14.1). REST only; the `qloo` harness isn't used in production. "8 Oct" is the live result from the key-day spike.

| # | Capability | Endpoint and key parameters | Used in | 8 Oct result |
|---|---|---|---|---|
| Q1 | Resolve venues | `/search`: `query=<cleaned name>`, `types=urn:entity:place`, `filter.address=<street>`; fallback `filter.location=<lat>,<lon>` + `filter.radius=0.5` (miles), `take=5` | Read, all blocks | ✅ 47–57% matched; precision 24 of 25 certain, 1 likely |
| Q2 | Resolve brands, comparables, competitors | `/search`: `types=urn:entity:brand`, `take=5` | Read, Partners, Message | ✅ only 3 of 10 stockist brands exist as brands (Brightland, MUD\WTR, Juniper Ridge); all demo brands resolve |
| Q3 | Tags and the allow-list | `/v2/tags`: `filter.query`; `/v2/tags/types` | Startup | ✅ place genre URNs confirmed (§7.3) |
| Q4 | Fingerprint | `/v2/insights`: `filter.type=urn:tag`, `filter.tag.types=<allow-list>` | Read | ✅ (several types per call return HTTP 200; filter by `subtype` in code) |
| Q5 | Metros | `urn:entity:place`, `diversify.by=properties.geocode.metro`, `diversify.take=4`, `take=50`, `filter.exclude.location.query=<home metro>` | Markets | ✅ 14 metros |
| Q6 | Taste heatmap | `urn:heatmap`, `filter.location.query=<metro>`, `signal.interests.entities` | Markets | ✅ 577 geohash cells; `output.heatmap.boundary` accepts only `urn:geohash` or `urn:entity:locality`, and `urn:entity:locality` returned HTTP 500 → neighbourhood names come from Overture (§9.4) |
| Q7 | Places | `urn:entity:place`, `filter.tags`, `operator.filter.tags=union`, tier filters, `filter.exclude.entities`, `feature.explainability=true`, `take=50`, pages 1–2 | Places | ✅ explainability on 20 of 20; `audience_growth` values present |
| Q8 | Score a fixed pool | `filter.results.entities=<≤ 50 IDs>`, `take ≤ 50` | Re-rank, bridges, mutual fit, comparison, ranking check | ⚠️ `take` maximum is 50; a 50-venue pool returned 33 scored |
| Q9 | Partner brands | `urn:entity:brand`, `filter.popularity.max=0.97`, `filter.exclude.entities` | Partners | ✅ no top-10 brand above the 99th percentile |
| Q10 | Peer set and mutual fit | `urn:entity:brand` + `filter.tags=<narrowest genre>`, `take=14`; reverse: `signal.interests.entities=<partner>`, `filter.results.entities=<15 peers>` | Partners | ✅ 15 of 15 ranked |
| Q11 | Podcasts | `urn:entity:podcast`, `filter.popularity.max=0.97`, `take=20` | Partners | ✅ 20 returned |
| Q12 | Bridges | `urn:entity:brand`, `signal.interests.entities=<venue>`, `filter.results.entities=<brand set>` | Places drawer, drafts | ✅ venue signals return lifestyle brands (Madewell, Goop, Warby Parker…), suitable as shared loves |
| Q13 | Themes | `urn:tag`, `filter.tag.types=urn:tag:theme:qloo`, `take=10` | Message | ✅ Brightland: Connection, Authenticity, Curiosity; MUD\WTR: Health Optimization, Longevity, Mindfulness |
| Q14 | Cultural references | `urn:entity:tv_show`, `urn:entity:movie`, `urn:entity:artist`, `urn:entity:book`, `take=5` each | Message, Moments | ✅ Brightland: Chef's Table, Julie & Julia, Brandi Carlile, Freshwater |
| Q15 | Positioning over a shared pool | `urn:tag`, `filter.results.tags=<≤ 50 tag IDs>` under each brand's signal | Message | ✅ 26 and 24 of 30 pooled tags scored. (`/v2/analysis/compare` works for large brands but returned no tags for Brightland; not used) |
| Q16 | Audience skew | `urn:demographics`, `signal.interests.entities` | Message | ✅ age buckets and gender returned |
| Q20 | Audience interests | `urn:audience`, `signal.interests.entities`, `take=50`; types from `/v2/audiences/types` and `/v2/audiences?filter.audience.types=<type>` | Message | ✅ 10 audience types; Brightland's top results: Veganism, Organic Ingredients, Finance Professional, Arts Crafts, Cooking… (sensitive types filtered out, §9.17) |
| Q17 | Festivals | `urn:entity:place`, `filter.tags=urn:tag:genre:place:festival`, `filter.location.query=<metro>`, `take=10` | Moments | ✅ 4 festivals in Chicago |
| Q18 | Name-and-address signals | `POST /v2/insights` | Intake (optional) | ✅ HTTP 200 |
| Q19 | Health check | `GET /` | Monitoring | ✅ |

**Not available on the hackathon endpoint (8 Oct):**
- `/v2/trending` returned an empty list even for Taylor Swift, across three date ranges.
- Locality enrichment tags (`{month}_event`, `peak_tourism_month`) are absent.
- `output.heatmap.boundary=urn:entity:locality` returned HTTP 500.

Athena doesn't depend on any of these.

**Tested on 8 Oct and not used** (Brightland, cafés in Chicago, top 20):
- `signal.demographics.audiences` alongside the brand: 0 of 20 positions changed, for both Veganism and Finance Professional. With an audience as the only signal, results were generic (Starbucks, Corner Bakery).
- `signal.interests.tags` with a theme tag: alone, it gave near-identical affinities and generic venues (1 of 20 overlapping the brand-only list); added to the brand, 19 of 20 venues stayed and one tag-heavy venue jumped to first. For partners, it swapped 2 of the top 10. `signal.interests.tags.weight` was accepted, but the result matched the brand-only list.
- `filter.location.query` on `urn:audience`: no change from the national list.

**Budget per plan:**
- R1: about 31 Qloo calls with 12 accounts and 5 drafts, including resolution.
- R2: about 23.
- R3: about 27.
- At most 60 for any plan.

**Caching:**
- Entity and tag lookups: forever.
- Insights responses: 24 hours, keyed by sorted parameters.
- Demo brands: refreshed daily by the warm-cache job (§14.9).

**Retries:** 429 and 5xx get exponential backoff, at most twice. A 400 is logged and triggers recovery, never a retry. A 401 or 403 raises a configuration alert.

**Kit rules:**
- The browser never calls Qloo.
- The key never appears in the repo, the browser bundle, the trace or the video.
- Each request is as small as the question allows.
- No bulk scraping, and no Qloo data in the repo.

### 11.2 Gap-filling sources

Each row exists because of a specific Qloo gap. None of them ranks anything.

| Source | Gap it fills | What Athena takes | When it's called | Cost and terms (checked 8 Oct) |
|---|---|---|---|---|
| **US Census Bureau API**, ACS 5-year (2020–2024 vintage) | Qloo has no market size | Metro population (`B01003_001E`) and median household income (`B19013_001E`) for the 25 metros, by CBSA code | Once per metro; cached for good | Free; requires a key. Values are labelled "Census, ACS 2020–2024, aggregate" |
| **Overture Maps in BigQuery** (`bigquery-public-data.overture_maps`): `division_area` and `place` | Qloo's neighbourhood boundary fails (Q6); Qloo lacks about half of small venues (Q1) | Neighbourhood polygons per metro; for venues Qloo lacks: name, coordinates, phone, website, categories, operating status | One extraction per metro, stored in Firestore, then read from there | BigQuery: the first 1 TB of queries a month is free, then billed to the credit. Licence ODbL; attribution "© Overture Maps Foundation, OpenStreetMap contributors" [VERIFY the trial account can query it; VERIFY the scan size per metro] |
| **Ticketmaster Discovery API v2** | `/v2/trending` and the timing tags are empty | Upcoming events for the crowd's top Qloo artists in the target metro: name, date, venue, event URL | Only when a user opens Moments; cached 24 h | Free key, 5,000 calls a day (the docs say 5 per second, the FAQ says 2). **Terms bar deriving revenue from the API.** Fine for the free hackathon app; the paid product needs a Ticketmaster agreement or drops shows. Event content is cached only "for reasonable periods"; anything Ticketmaster asks to remove goes within 24 h; the licence is revocable |
| **Gemini Search grounding** (Vertex) | Festivals from Q17 have no dates | The next date of each festival, with a source URL | Only when a user opens Moments; cached 24 h | 5,000 grounding queries a month free across Gemini 3 models, then $14 per 1,000 (from the credit). Capped at 150 a day (§14.5) |
| **Apple Podcasts lookup** (iTunes Search API) and the show's RSS feed | Qloo's podcast episode count is a placeholder, and it has no dates or contacts | Episode count, latest episode date, genre, Apple link; website and contact email from the feed | Per podcast shown; cached 1 day; spaced, ≈ 20 a minute at most (Apple's stated limit) | Free; no key. Metadata only, no artwork or audio. Replaced Podcast Index on 9 Oct (no key to wait for) |
| **Wikidata** (`wbgetentities`) | Partner brands lack contact paths | Official website (P856) and social handles (Instagram P2003, X P2002), via the Wikidata ID that Qloo returns in `external` | Per partner card opened; cached 7 days | Free; CC0 data; a descriptive User-Agent is required |
| **Gemini URL context** (Vertex) | Qloo can't read a startup's website | The category, tier, products and any listed stockists, from ≤ 3 URLs the user gives | Once per own-brand intake | The tool is free; page content is billed as input tokens (from the credit) |
| **Imagen 4 Fast** (Vertex), P1 | Not a Qloo gap: an optional visual summary of the Message block | 4 mood-board images | On request | $0.02 per image (from the credit); capped at 20 images a day |

**Rejected after checking:**
- **Google Places API:** no events or busy-times fields; separate per-call billing; display terms unchecked.
- **Google Trends in BigQuery:** only the top 25 rising searches per metro, so a category can't be looked up.
- **Google Trends API:** an application-only alpha. Kept as P2 (F38) only if access is granted.
- **Gmail and Calendar APIs:** they need OAuth app verification; a Gmail compose link and an `.ics` file do the job.
- **reCAPTCHA:** not needed, because the caps in §14.5 bound spend.

---

## 12. Agent design

### 12.1 Shape

One LLM orchestrator (Gemini 3.8 Flash on Vertex, §12.8) with typed tools over the Qloo client and the enrichment clients (§9.19). The ranking methods inside the tools are deterministic. The LLM reads the business, chooses the recipe, decides recovery and questions, and does all the writing.

### 12.2 Tools

| Tool | What it does |
|---|---|
| `read_website` | Reads ≤ 3 user URLs through Vertex URL context and returns the §9.20 schema |
| `parse_accounts` | Turns pasted text, a CSV or an image of a list into rows |
| `resolve` | Matches rows or names to Qloo venues and brands; returns matched, ambiguous and unresolved |
| `ask_user` | Shows a question with options (needs_input) |
| `classify_business` | Category, tier, motions, confidence and why (§7.2) |
| `build_playbook` | Turns the confirmed card into a `PlaybookConfig` and its recipe |
| `fingerprint` | §9.2 |
| `rank_metros` | §9.3, with the Census join (§9.19) |
| `map_taste` | §9.4: geohash heatmap, plus Overture neighbourhood names |
| `rank_venues` | §9.5, with contact enrichment (§9.19) |
| `rank_partners` | §9.6: brands (with Wikidata) and podcasts (with Apple Podcasts) |
| `who_listens` | §9.6: Qloo Insights with each top podcast as the signal |
| `mutual_fit` | §9.6: the reverse side for one partner |
| `rerank` | §9.7 |
| `find_bridges` | §9.8 |
| `build_message` | §9.15: themes, references, hooks and content ideas |
| `position_vs` | §9.16: shared-pool positioning against ≤ 3 competitors |
| `audience_skew` | §9.17: the age and gender skew, and the allow-listed audience interests |
| `find_moments` | §9.18: Ticketmaster shows and festivals with grounded dates |
| `mood_board` | §9.21 (P1) |
| `llm_only` | §9.9 |
| `draft_outreach` | Writes a draft of the recipe's kind and runs the validator (§9.10) |
| `plan_route` | §9.12 |
| `ranking_check` | §10.3 (offline script and Method page only, never in a user run) |

**Every tool call carries a required `why` of at most 90 characters.** The rail shows `why → result`, so the narration is the agent's own reasoning, not a script. Examples:

- "You grow city by city, so I'm ranking launch cities before venues."
- "Few gourmet grocers in Chicago, so I'm widening to gift shops and cafés."
- "No Ticketmaster shows for your top artists in Austin, so I'm checking festivals."

### 12.3 Decisions the agent makes (each one narrated)

- the category, tier, stage and motions, and therefore the recipe;
- the venue types and partner types;
- the signal strategy for the stage;
- which block and which metro to open first;
- which competitors to position against when the user names none;
- how to recover from weak results;
- when to ask the user (an ambiguous match, low confidence, a missing city);
- whether to re-rank or refresh after an outcome;
- which items get drafts (by default, the top 5 that aren't already won).

### 12.4 Recovery ladder

When a block comes back thin (§9.11), the agent steps down this ladder, one rail line per step:

1. Relax the tier one step.
2. Widen from a neighbourhood to the whole metro.
3. Swap to the recipe's fallback venue types, where it has them (for example, gourmet grocers → gift shops and cafés, §7.3).
4. Add `backfill.content_based` [VERIFY that it keeps the result type]; those results are labelled "backfilled".
5. Explain the gap and show the thin-results label.

### 12.5 Status handling

| Situation | Status | Behaviour |
|---|---|---|
| 200 with results | ok | Continue |
| 200 with no results | empty | Recovery ladder |
| 400 | error | Fix the parameters; no retry |
| 429, 5xx, network failure | retryable | Back off; at most 2 retries; then the labelled fallback (§14.2) |
| Ambiguous entity | needs_input | Ask, with options |

### 12.6 Autonomy

- **Automatic:** reading the business, ranking, Message, Moments, drafts, routes, files.
- **Done by the user:** confirming the card, approving drafts, recording outcomes.
- **Never:** sending messages, contacting anyone, collecting contact details at scale, running ads.

### 12.7 Limits

At most 24 tool calls, 3 recovery steps and 3 questions per plan; at most 60 Qloo calls (§11.1), 10 Ticketmaster calls and 10 grounding calls per Moments open; and a token cap of 400,000 input and 40,000 output tokens per plan.

### 12.8 Models [DECISION]

**The default is Gemini on Vertex AI, paid from the credit (§14.8).** Checked on 8 Oct 2026:

- **The credit can't pay for Claude on Vertex.** Google's Free Trial terms say: "You can't access or use the $300 credit for a generative AI partner model that is offered as a managed API." Claude on Vertex is exactly that, so it would be billed to a card.
- **The credit can't pay for the Gemini API through AI Studio** either. Every call must go through **Vertex AI**.
- **A Claude Pro plan doesn't include API access.** Anthropic's support article says paid plans don't include the API, which is billed separately through the Claude Console; only the Max and Team plans include monthly API credits. A personal subscription is also not meant to power an app others use.

| Role | Model on Vertex AI | Price per 1M tokens, input / output |
|---|---|---|
| Parsing, classification, orchestration | **Gemini 3.8 Flash** (`gemini-3.8-flash`) | $0.75 / $3.75. Introductory price through 31 Dec 2026, then $1.50 / $7.50 |
| Draft retry, after Flash fails validation twice | **Gemini 3.1 Pro** (`gemini-3.1-pro-preview`) | $2.00 / $12.00; cached input $0.20 |
| LLM-only baseline, with web search on and Qloo off (§9.9) | **Gemini 3.1 Pro with Grounding with Google Search** | Tokens as above, plus grounding: 5,000 grounding queries a month at no charge across Gemini 3 models, then $14 per 1,000 |

- **Swappable provider.** One `lib/llm` interface takes a provider setting: `vertex-gemini` (default), `anthropic` (the Claude API, billed separately) or `vertex-claude` (billed to a card, not the credit). Changing provider is a config change, never a code change. If a Claude key is added later, Claude Sonnet 5.5 takes the fast role and Claude Opus 5.5 the strong roles.
- **The baseline must be strong,** so it isn't a straw man (§19). It uses the Pro model with search grounding, and its model and provider are recorded in the registration (§10.3) and on the Method page.
- **Endpoint: `global`.** Every Gemini call goes to `https://aiplatform.googleapis.com/v1/projects/<project>/locations/global/publishers/google/models/<model ID>:generateContent`. Tested on 8 Oct on the Free Trial project:
  - `gemini-3.8-flash` and `gemini-3.1-pro-preview` answered on `global`;
  - both returned 404 on `us-central1`, and `gemini-3.1-pro` (without `-preview`) returned 404 everywhere;
  - Grounding with Google Search on `gemini-3.1-pro-preview` returned an answer with grounding sources.
  - Google's locations page says the global endpoint gives higher availability and fewer 429 errors, has its own quotas, and doesn't support tuning or data-residency guarantees. Athena uses neither; it sends no personal data.
  - Cloud Run stays in `us-central1`; only the LLM calls leave the region.
  - [VERIFY] that global prices equal the published per-token prices below. Google's locations page doesn't state it either way. Check in Billing → Reports after the first day of use.
- **Preview model:** `gemini-3.1-pro-preview` is a preview model, which Google can change or retire. The model ID is one config value (`GEMINI_PRO_MODEL`), so a swap is a config change. If it disappears, the baseline and draft retries move to the next Pro ID that answers, and the Method page records the change.
- **Authentication:** on Cloud Run, calls use the service account, so no LLM key is stored.
- **Context caching** of the system prompt and tool definitions: cached input on Gemini 3.1 Pro is billed at a tenth of the input price.
- **429s ("Resource exhausted"), checked against Google's docs on 8 Oct:** on Standard PayGo a 429 is temporary contention for shared capacity, often set off by sharp second-level bursts, not a used-up quota; the throughput baseline grows with 30-day spend, and Flash has higher limits than Pro. Google's remedies: the global endpoint, truncated exponential backoff, smoothing traffic, or Provisioned Throughput (the only hard guarantee, far above the credit). One test script hit a 429 on 8 Oct after back-to-back grounded Pro calls. **So every Gemini call goes through one gate** (`lib/llm/vertex.ts`): at most 4 Pro and 6 Flash calls in flight, starts spaced ≥ 300 ms apart, 429 and 5xx retried with jittered backoff (1, 2, 4, 8, 16 s) inside the caller's time budget, and a Pro call moved to Flash after two busy answers. A user never sees a 429: past the budget, the block's normal fallback applies (§14.2).
- **Streamed answers end with the important part:** the last server-sent event carries the end of the answer, the grounding sources, the search chip and the finish reason, and may have no trailing newline. Athena dropped it until 9 Oct, which gave empty answers marked complete (podcast numbers and festival dates); the parser now reads the remaining buffer when the stream ends. Grounding metadata spread over several events is merged, not replaced.
- **Thinking counts against the output budget:** a grounded Pro answer used ~1,860 thinking tokens on 9 Oct, so grounded calls set `maxOutputTokens` to 8,192 (2,048 cut the answer off).
- **[VERIFY] (S17, still open):** Vertex AI quotas on a Free Trial account, on the `global` endpoint. Free Trial accounts can't request quota increases. Run a burst of 20 parallel Flash calls and confirm none are throttled.

### 12.9 MCP server (P1)

- **What:** a second Cloud Run service that exposes Athena's block tools to other agents over MCP's streamable HTTP transport at `/mcp`. Google documents this pattern for Cloud Run; stdio transport isn't supported there.
- **Tools:**
  - `find_markets(brand, accounts?, target_metro?)`
  - `find_places(brand, accounts?, metro)`
  - `find_partners(brand, accounts?)`
  - `build_message(brand, accounts?, competitors?)`
  - `find_moments(brand, accounts?, metro)`

  Each returns the same JSON as the block, including source labels.
- **Access:** public, with the same per-IP caps as the app (§14.5). The demo brands are served from the warm cache.
- **Docs:** the README gives a client config for Gemini CLI and Claude Desktop.

---

## 13. Screens and UX

### 13.1 Layout (desktop, ≥ 1024 px)

- **Header line** above the workspace: the title, the subtitle and the computed comparison line (§2.2). It collapses after the first interaction.
- **Top bar:** name · brand switcher · **Try your own brand** · *Without Qloo* toggle (on Places) · Trace · Sources · **?** (reopens the "Try this" card). A fallback banner appears here only when §14.2 applies.
- **Map** on the left, about 60% of the width.
- **Panel** on the right, 420 px wide. Each block's header shows "Built from [n] Qloo calls" (F14) and one muted line on how the block was ranked, in plain words with no slogan (for example "Ranked by how closely each venue's crowd matches your accounts' taste, in Los Angeles."). Its tabs follow the recipe: **Read**, then the blocks in recipe order, then **Pipeline** and **Actions**. For the demo brands:
  - Brightland (R1): Read · Markets · Places · Partners · Message · Moments · Pipeline · Actions
  - Timeleft (R2): Read · Markets · Places · Moments · Partners · Message · Pipeline · Actions
  - Master & Dynamic (R3 + retail): Read · Partners · Message · Moments · Markets · Places · Pipeline · Actions
- **Agent rail** floating at the bottom left of the map: the last three lines, expandable to the full log.
- **"Try this" card** floating at the bottom right of the map (§2.4).

### 13.2 Screens

- **Workspace** (this is the landing page)
- **Venue drawer** and **partner drawer**
- **Trace drawer**
- **Pipeline board**
- **Actions tray:** drafts and route
- **Try-your-own intake:** one card with name, website URLs, city, comparable brands, competitors, and a paste or upload area
- **Message view:** theme chips, reference rows (TV, film, music, books), positioning cards, the audience-skew chart and the interest chips with their fixed label, hooks and content ideas, the mood board (P1)
- **Moments view:** a list ordered by Qloo taste rank, each item with its rank, date, source label and outbound link; a **Soonest first** toggle
- **Method page**
- **Sources page**
- **What we don't know**

### 13.3 Partner cards

- Name, type (brand or podcast), price tier (brands only), and rank in the list.
- **Contact line:** website and socials (Wikidata) for brands; for podcasts, episode count, latest episode, website and contact email (Apple Podcasts), then Who listens (Qloo) and the public-numbers button; each with its source label.
- **Mutual fit bar** (brands): two halves, "You → them" and "Them → you".
- 2–3 reason chips: contributing entities and shared tags.
- A **Draft inquiry** button.
- While the Partners tab is open, the map shows the activation or pop-up neighbourhood if the recipe has one. Otherwise it dims behind the panel.

### 13.4 Map encoding (shape and colour, never colour alone)

| Element | Shape | Colour token |
|---|---|---|
| Athena pick | Numbered solid circle | `--pick` |
| Account not in Qloo (Overture) | Hollow diamond | `--account` |
| Moment (show or festival venue) | Star | `--moment` |
| LLM pick | Triangle | `--llm` |
| LLM pick, unverified | Dashed triangle with "?" | `--llm` |
| Account | Small diamond | `--account` |
| Heatmap cell | Rectangle | One sequential hue |
| Pop-up or activation neighbourhood | Outlined cell group | `--pick` outline |

### 13.5 Motion

- Fly-to: 1.2 s.
- Picks drop with a 20 ms stagger.
- Flipping Without Qloo cross-fades the list in 250 ms, and the comparison metrics count up.
- Switching brands reorders the panel's tabs with a 300 ms slide, so the judge sees the recipe change.
- Re-ranking animates over 400 ms.
- With `prefers-reduced-motion`, states change instantly.

### 13.6 Phones (< 640 px)

- The map sits on top at 45% of the screen height.
- The panel becomes a bottom sheet with the same tabs.
- The rail shrinks to one line.
- The "Try this" card becomes a chip that opens a bottom sheet, and the comparison metrics stack.
- A list view replaces the map on request.

### 13.7 Accessibility

- A list view mirrors everything on the map.
- Keyboard order runs top bar → panel → map, with visible focus rings.
- Contrast meets WCAG AA.
- Comparison metrics and tab changes are announced with `aria-live`.
- The audience-skew chart has a text table equivalent.

### 13.8 States

- **Loading:** rows stream in as skeletons while the rail narrates.
- **Empty:** never blank; the agent recovers or explains.
- **Thin:** what exists, under the "Thin results" label (§9.11).
- **Error:** an honest message, a Retry button and the labelled fallback (§14.2).

### 13.9 Copy

- One-line reasons. Numbers before adjectives.
- Data values use tabular numerals with a source label (Qloo, Census, Overture, Ticketmaster, Apple Podcasts, Wikidata, Web). Agent text is labelled "Draft" or "Agent".
- "Measured", "Demonstrated", "Tuned" and "Beta" appear exactly where §2.1 and §9.11 say.
- Banned in product copy, enforced by a test that scans UI strings: *predicts, will stock, likely to buy, guaranteed, insights, AI-powered, leverage, seamless, unlock, revolutionise, synergy*. Endpoint names shown in the trace, and Qloo's product name "Qloo Insights" (the API behind every ranking), are exempt.

### 13.10 Visual tone

Calm and editorial: light by default with a dark mode, one accent colour, and a muted map so the pins carry the story. Tokens and components live in DESIGN.md.

---

## 14. Architecture

### 14.1 Stack

Everything runs on one Google Cloud project, paid from the $300 Free Trial credit (§14.8). No other paid service is used.

| Layer | Choice |
|---|---|
| App | Next.js (App Router) and TypeScript in one service, built as a container (`output: "standalone"`); server-sent events for the rail |
| Hosting | **Cloud Run**, US region (`us-central1`). Minimum instances 1, so it never sleeps; request-based billing, because every live run streams inside its own request and the warm instance is billed at the idle rate; request timeout 15 minutes (the default is 5, the maximum 60); 1 vCPU and 1 GiB to start; maximum instances 3, to bound spend. HTTPS on the `*.run.app` URL is automatic |
| Database | **Firestore** in Native mode; the free tier (1 GiB of storage, and 50,000 reads, 20,000 writes and 20,000 deletes a day) covers it. It holds runs, events, entity and tag caches, sessions, pipelines, drafts and backtests. Cloud Run's disk is wiped on restart, so no state lives on it. Access goes through one `lib/db` module, so the store could be swapped |
| LLM | **Gemini on Vertex AI**: 3.8 Flash (`gemini-3.8-flash`) and 3.1 Pro (`gemini-3.1-pro-preview`), called on the **`global` endpoint** (both return 404 in `us-central1`), with Grounding with Google Search for the baseline (§12.8). The provider sits behind one `lib/llm` interface, so Claude can be added later through the Claude API, billed separately. Server-side only, authenticated through the Cloud Run service account, so no LLM key is needed in production |
| Secrets | **Secret Manager** holds `QLOO_API_KEY`, `TICKETMASTER_API_KEY`, `CENSUS_API_KEY` and `WARM_TOKEN` (4 secrets, inside the 6-version free tier), mounted into Cloud Run as environment variables. Locally they live only in `.env`, which is git-ignored |
| Warehouse | **BigQuery**, for one-time Overture extractions per metro (§9.19); results stored in Firestore. The first 1 TB of queries a month is free |
| Scheduled jobs | A **Cloud Run job** `warm-cache`, triggered once a day by **Cloud Scheduler**, refreshes the demo brands' Qloo responses (§14.9) [VERIFY Cloud Scheduler's free tier; the cost goes to the credit either way] |
| External APIs | Census, Ticketmaster Discovery, Apple Podcasts lookup, Wikidata (§11.2): free, called only from the server |
| Build and deploy | **Cloud Build**, triggered on every push to `main` in the public GitHub repo. It builds the image into Artifact Registry and deploys to Cloud Run. A manual `gcloud run deploy --source .` works as a backup. The free tiers cover it: 2,500 build-minutes a month, and 0.5 GB of Artifact Registry storage, so a cleanup policy keeps only the last 2 images |
| Map | MapLibre GL JS with free vector tiles (OpenFreeMap [VERIFY]); fallback: Leaflet with OpenStreetMap tiles |
| Motion | Framer Motion |
| Geocoding | Overture place records (§9.19); OpenStreetMap Nominatim only as the S18 fallback |
| Monitoring | `/health`, plus a **Cloud Monitoring uptime check** every 5 minutes. Uptime checks are free up to 1 million executions a month per project. The alerting policy on the check costs $0.35 a month per metric reference, paid from the credit. **Cloud Logging** for errors (the first 50 GiB a month are free). **Budget alerts** (§14.8) |
| Tests | Vitest for the methods; Playwright for the "Try this" path and a phone viewport |

### 14.2 Run logs and the fallback

- **Every run is live** and writes an append-only event log: tool, why, request summary, result. Logs are stored privately in Firestore, never in the repo.
- **Fallback:** if Qloo or the LLM still fails after retries, or a cap is reached, the app shows the brand's most recent successful run under a banner: "Showing the last live run from [time]: [reason] · Retry".
- **Cached by design, with their date:** the Without Qloo answers for the demo brands. Re-run is capped (§14.5).

### 14.3 Fixtures first

With `ATHENA_FIXTURES=1`, the app serves synthetic data shaped like Qloo's and the enrichment sources', labelled FIXTURE: made-up venue, brand, podcast, artist and event names, with Chicago-shaped coordinates. All three recipes and all six blocks are built on fixtures from day one, so a late key never blocks design work, and anyone can run the repo without keys.

### 14.4 Data model

Each type below is a Firestore collection: `runs` (with `events` as a subcollection), `qlooCalls`, `enrichments`, `comparisons`, `moments`, `overture_<metro>`, `cache` (keyed by sorted parameters, with a TTL field for Firestore's TTL policy), `sessions`, `pipelines`, `drafts` and `backtests`.

```ts
type QlooCall = { id: string; endpoint: string; params: Record<string, string> /* key never stored */;
                  status: number; ms: number; resultCount: number; at: string };
type AgentEvent = { t: number; tool: string; why: string;
                    status: "ok" | "empty" | "thin" | "error" | "needs_input"; callIds: string[]; summary: string };
type Run = { id: string; brandId: string; mode: "live" | "fallback" | "fixture";
             playbook: PlaybookConfig; startedAt: string; events: AgentEvent[] };
type Venue = { qlooId: string; name: string; address: string; lat: number; lon: number;
               priceLevel?: number; tags: { id: string; name: string; type: string }[];
               audienceGrowth?: number; isClosed?: boolean; isChain: boolean };
type Partner = { qlooId: string; name: string; kind: "brand" | "podcast"; priceTier?: number;
                 pForward: number; pReverse?: number; tags: { id: string; name: string; type: string }[] };
type Evidence = { kind: "contribution" | "tag" | "growth" | "price" | "fit"; label: string; value?: number; callId: string };
type Bridge = { brandId: string; name: string; pAccounts: number; pVenue: number; callIds: [string, string] };
type Pick = { targetId: string; kind: "venue" | "brand" | "podcast"; rank: number; reasons: Evidence[]; bridges?: Bridge[] };
type PipelineItem = { targetId: string; kind: "venue" | "brand" | "podcast"; stage: string /* from the recipe */; at: string };
type Enrichment = { source: "census" | "overture" | "ticketmaster" | "applepodcasts" | "wikidata" | "web";
                    field: string; value: string | number; url?: string; fetchedAt: string };
type Moment = { kind: "show" | "festival"; name: string; tasteRank: number; date: string | null;
                venue?: string; url?: string; source: "ticketmaster" | "web"; callIds: string[] };
type Positioning = { competitorId: string; shared: string[]; onlyYou: string[]; onlyThem: string[]; callIds: string[] };
type Comparison = { block: Block; athena: string[]; llm: { name: string; status: "found" | "closed" | "unverified"; popularity?: number }[];
                    metrics: Record<string, number>; llmRunAt: string };
type RankingCheck = { brand: string; metroA: string; metroB: string; aucAthena: number; aucPopularity: number;
                      scoredShare: number; prereg: { commit: string; date: string } };
```

### 14.5 Limits and security

- **Caps:**
  - 20 demo-brand loads per IP per hour;
  - 5 own-brand plans per IP per hour, and 60 a day in total;
  - 10 new Without Qloo runs a day in total;
  - 150 Search-grounding calls a day for festival dates, and 60 for podcast public numbers;
  - 5,000 Ticketmaster calls a day (its quota);
  - 20 Imagen images a day;
  - 2,000 Qloo calls a day. Past a cap, the app shows the brand's last live run with a friendly note. Bot traffic is filtered before any run starts.
- **Key:** in production it lives only in Secret Manager; in development, only in `.env`. Logs and the trace redact it.
- **Spend:** Cloud Run's maximum instances is 3, and budget alerts fire at $50, $150 and $250 (§14.8). If spend passes $250, the LLM caps are lowered and the app leans on the labelled fallback.
- **Input:** Athena's server never fetches URLs users supply. Website reading goes only through the Vertex URL context tool, after the URL checks in §9.20.
- **Sessions:** anonymous and deleted after 7 days. No accounts, no personal data.

### 14.6 Repo layout

```
/app            pages (workspace, method) and API routes
/lib/qloo       client, parameter builder, cache, rank utilities
/lib/llm        one interface: Gemini on Vertex (default), the Claude API, or Claude on Vertex
/lib/enrich     census, overture, ticketmaster, apple-podcasts, podcast-numbers, wikidata, grounding clients and caches
/lib/db         Firestore access: runs, events, caches, sessions, pipelines, drafts, backtests
/lib/playbook   categories, tiers, stages, recipes, PlaybookConfig builder
/lib/blocks     markets, places, partners, message, moments, act (drafts, route, pipeline)
/lib/methods    resolve, fingerprint, rerank, bridges, mutual fit, positioning, audience skew, quality gates
/lib/agent      tools, prompts, validator, event log
/lib/proof      comparison metrics (§10.2), ranking check (§10.3)
/jobs           warm-cache job, Overture extraction script
/fixtures       synthetic data for all three recipes (FIXTURE)
/proof          REGISTRATION.md, stockists/*.csv (public business data), results.json (our counts)
/scripts/spike  key-day spike scripts (§18); outputs in .cache/ (git-ignored)
/docs           METHOD.md, QLOO.md (diagram and redacted examples), DESIGN.md
/tests          unit and end-to-end tests
/deploy         Dockerfile, cloudbuild.yaml, Cloud Run service settings, setup script for the Google Cloud project
```

### 14.7 Tests (one command, run in CI)

- The maths: percentiles, the re-rank, and the `min()` behind bridges and mutual fit.
- The recipe engine: each demo brand's playbook produces the expected blocks in order; categories marked Beta show the badge.
- The validator rejects a fake venue, a fake brand and a wrong number.
- The allow-list rejects `customer_identity` tags; demographics appear only in the skew chart, and no request parameter is ever built from them.
- The audience allow-list: a fixture containing every audience type shows only the four allowed types, and no request parameter is ever built from an audience.
- Each block's "Built from [n] Qloo calls" equals the Qloo calls in its run log.
- Positioning classification on fixed fixture percentiles; Moments drops any date without a source.
- Enrichments never change an order: a property test over fixtures.
- A banned-words scan over UI strings.
- The chain rule, the matcher's precision on the labelled set, and the ranking-check AUC on synthetic data.
- End to end: a fresh browser follows the "Try this" card to the end; the comparison line equals the metrics computed offline from the same cached answer; a forced outage shows the fallback banner; the phone viewport works.

**README** contents:

- the problem and the live URL;
- "No login. The app is live when you arrive: follow the **Try this** card, or try your own brand.";
- setup from a clean machine: Node 22+, `pnpm i`, `cp .env.example .env`, `pnpm dev` (runs on fixtures without keys), `pnpm test`;
- how Athena uses Qloo, which gaps each other source fills (§11.2), the results including the failed blind test, and the limitations;
- the MCP client config (P1).
- the MIT license, visible in the repo's About section.

### 14.8 Budget: the $300 Google Cloud credit

Every figure here was checked against Google's pricing pages on 8 Oct 2026, in `us-central1` (Tier 1). Gemini calls use the `global` endpoint (§12.8); the Gemini rows assume the same per-token prices there [VERIFY]. Token counts per plan are estimates; S12 on key day measures them.

**The credit's rules** (Google Cloud Free Trial terms):

- It's $300 to spend over 90 days, and **we're not billed** while the account is a non-billable Free Trial account. When the credit runs out or expires, resources stop, with a 30-day grace period to upgrade. Nothing is charged unless the account is upgraded.
- **It can't pay for** generative AI partner models offered as a managed API (Claude on Vertex), or for the Gemini API in AI Studio. That's why the LLM is Gemini **on Vertex AI** (§12.8).
- **While on the trial,** the account can't use Google Cloud Marketplace, can't request quota increases and can't attach GPUs. Athena needs none of these.
- **The credit, checked in Billing → Credits on 8 Oct:** ₹28,796.63 (the account is billed in INR; ≈ $300), 100% remaining, from 7 Oct 2026 to **7 Jan 2027**. That's after judging ends on 17 Nov.
- **A valid payment method is required, even on the trial.** With only a one-time UPI QR code on file, the console showed "past due or does not have valid payment information", the billing account reported `open: false`, and every Vertex call failed with 403 "requires billing to be enabled". After a UPI payment method was added on 8 Oct, the account reported `open: true` and calls worked. Adding a payment method is **not** an upgrade.
- **Budget alert, set 8 Oct:** "Athena - 300 USD trial credit", ₹28,800, counting cost before credits, one period from 8 Oct 2026 to 31 Jan 2027, alerting at 17%, 50%, 83% and 100% (≈ $50, $150, $250 and $300).

**Where the money goes, 9 Oct to 17 Nov (about 40 days)**

| Item | Pricing (checked) | Estimate |
|---|---|---|
| Cloud Run, 1 vCPU and 1 GiB, 1 warm instance, request-based billing | Idle minimum instance: $0.0000025 per vCPU-second and per GiB-second, about $13 a month. Active time: $0.000024 per vCPU-second and $0.0000025 per GiB-second. Free tier: 180,000 vCPU-seconds, 360,000 GiB-seconds and 2M requests a month | **$10–20** |
| Firestore | Free tier: 1 GiB, 50,000 reads, 20,000 writes and 20,000 deletes a day | **$0** |
| Cloud Build and Artifact Registry | Free tier: 2,500 build-minutes a month; 0.5 GB of storage (cleanup policy keeps 2 images) | **$0–2** |
| Secret Manager | Free tier: 6 active secret versions and 10,000 access operations a month | **$0** |
| Monitoring and logging | Uptime checks free up to 1M executions a month; alerting $0.35 a month per metric reference; logs free to 50 GiB a month | **About $1** |
| Gemini 3.8 Flash: agent, parsing, classification, drafts | $0.75 / $3.75 per 1M tokens. At about 150k input and 15k output tokens, a plan costs about $0.17 | **About $100** for 600 plans (building, rehearsals, judging) |
| Gemini 3.1 Pro with Search grounding: the LLM-only baseline and draft retries | $2 / $12 per 1M tokens; grounding free for 5,000 queries a month, then $14 per 1,000. A baseline run costs about $0.20–0.25 | **About $25** for 100 runs (the 9 registered runs, the demo caches and judges' capped comparisons) |
| Gemini URL context (onboarding) | Tool free; page content billed as input tokens, about 20k tokens per site ≈ $0.02 | **About $2** |
| Search grounding for festival dates | Inside the 5,000 free queries a month; capped at 150 a day | **$0** |
| BigQuery (Overture extractions) | First 1 TB a month free; 25 metros extracted once | **$0** if S18 confirms the scan size |
| Cloud Scheduler | 1 job [VERIFY free tier] | **≤ $1** |
| Imagen 4 Fast (P1) | $0.02 per image; ≤ 20 a day | **≤ $16** |
| Census, Ticketmaster, Apple Podcasts, Wikidata | Free, outside Google Cloud | **$0** |
| **Total** | | **About $155–175**, leaving at least $125 in reserve |

**Never used, because they would cost money outside the credit:** Claude on Vertex (a partner model); the Gemini API through AI Studio; Google Cloud Marketplace products; a custom domain (the `*.run.app` URL is used); the Google Trends API if it turns out to be paid.

**The rule that guarantees zero card charges:** the billing account stays a non-billable Free Trial account until 17 Nov. It's never upgraded, because a non-billable trial account stops resources instead of charging.

**Guards**

- **Budget alerts** at $50, $150 and $250 of credit spent, emailed to both owners. The thresholds are checked against the actual credit balance once a week.
- **Caps (§14.5):** past a cap, the app shows each brand's last live run, so judges never see an error and spend stays bounded.
- **Measure first:** after S12, the per-plan estimate above is replaced with measured token counts, and the caps are re-tuned if needed.

**After judging (17 Nov):** delete the Cloud Run services and jobs, the Firestore data and the BigQuery extracts. Qloo deactivates the hackathon key anyway. Any remaining credit simply expires.

### 14.9 Latency plan

Measured on 8 Oct (S12):
- **Qloo places calls:** 7–27 s.
- **Search:** about 3 s.
- **Brand recommendations:** about 4.5 s.
- **Tag calls:** about 1 s.

So:

1. **Warm cache for demo brands:** the daily `warm-cache` job replays every Qloo call the three demo brands need and stores the responses (24-hour TTL). Demo blocks then load in ≤ 5 s, because the ranking code recomputes from cached responses (§2.1).
2. **Streaming order for own brands:**
   - the Read card first (tag calls are fast);
   - then blocks in recipe order, each rendered as soon as its own calls return;
   - the agent rail narrates while slow calls run.
3. **Parallel calls:** independent Qloo calls within a plan run concurrently, at most 6 at a time.
4. **Pages:** Places requests page 2 only on "Show more".
5. **Targets:**
   - first card line ≤ 3 s;
   - demo blocks ≤ 5 s;
   - own-brand first block ≤ 30 s median;
   - own-brand full plan ≤ 120 s median.

   A run that exceeds 180 s shows what it has, plus the thin label.

---

## 15. Responsible use

- **Inputs:** business names and addresses, brand names, city names, a one-line description, website URLs the user gives, and images of lists the user uploads. Never consumer or personal data.
- **Outputs:** venues, brands, podcasts, cities, neighbourhoods, taste tags, cultural references, dated events, and aggregate audience skew and audience interests under the rules below.
- ***No customer is ever modelled, and no individual is ever a target.***
  - Qloo's person type, creators and influencers are never partners.
  - Artists appear only as cultural references and as performers of public events, never as people to contact.
- **Aggregate audience skew** (§9.17):
  - It's shown only in the Message block, always with the fixed label text.
  - It's never used in a filter, ranking, recipe decision or draft.
  - It's never phrased as a fact about the brand's customers.
- **Audience interests** (§9.17): only four audience types (hobbies and interests, leisure, spending habits, professional area). Communities, political preferences, lifestyle and beliefs, global issues, life stage and investing interests are never shown or stored. The same label and the same never-used-for rules apply.
- **Fingerprint allow-list:** `customer_identity`, `neighborhood_characteristic`, Wikipedia categories, and anything political or religious are never shown or stored. The allow-list is a code constant with a test.
- **Out of scope by policy:** alcohol brands, regulated health products, and anything that depends on targeting by health, identity, politics or other sensitive traits.
- **Language:**
  - Results are "taste match" and "priority to approach", never a prediction.
  - Venue drawers note that stocking also depends on price, margin, distribution and timing.
  - Partner cards note that fit means shared taste, not a deal.
- **Human gate:**
  - Athena never contacts anyone. Drafts are copy-only.
  - The founder confirms the business card before any plan is built on it.
- **Website reading** (§9.20):
  - Pages are read by the Vertex URL context tool, not by our server.
  - Page text is treated as data, never as instructions.
  - Everything extracted passes the output schema and the grounding validator.
- **Public data and real brands:**
  - Stockist lists come from brands' public locators.
  - Demo plans for real brands are labelled illustrative and unaffiliated.
  - Brands are contacted, and anonymised on request.
- **Source terms and attribution** (shown on the Sources page and in the footer):
  - Overture: ODbL, "© Overture Maps Foundation, OpenStreetMap contributors".
  - Census: public domain, cited as "U.S. Census Bureau, ACS 5-year".
  - Wikidata: CC0.
  - Ticketmaster: Discovery API terms. No revenue from the API, link out for tickets, remove content within 24 h on request.
  - Apple Podcasts lookup: free, no key.
  - Web dates: the cited page.
- **Kit rules:**
  - Qloo results look different from our interpretation.
  - No Qloo data in the repo, and the key is never exposed.
  - Requests stay small, and retries are bounded.
- **Learning rights:** Qloo may learn from anonymised entity arrays. We only ever send business, brand and place entities.

---

## 16. Success metrics

| Type | Metric | Target |
|---|---|---|
| Evidence | The With Qloo vs Without Qloo metrics (§10.2), computed for all 3 demo brands | Computed and published by 25 Oct |
| Evidence | Athena picks with ≥ 2 Qloo evidence chips | 100% |
| Proof | The ranking check (§10.3) | Registered before any test-brand call; published whatever the result |
| Versatility | QA checklist on the 5 tuned categories and the 3 demo recipes | All pass |
| Clarity | 5-second test on the Places block with Without Qloo flipped | 3 of 3 first-time viewers explain the difference |
| Clarity | Versatility test after following the "Try this" card | 3 of 3 first-time users can say how the three plans differ |
| Time | The comparison reached from arrival, following the "Try this" card | ≤ 60 s |
| Speed | First card line; each demo block (warm cache); own-brand first block; own-brand full plan | ≤ 3 s; ≤ 5 s; ≤ 30 s median; ≤ 120 s median |
| Reliability | Errors on the "Try this" path across 5 fresh-browser rehearsals | 0 |
| Grounding | Unsupported claims on screen; dates without a source | 0; 0 |
| Spend | Card charges; credit used by 17 Nov | 0; ≤ $200 of $300 |
| Impact | Founder calls across goods, tech and apps; real brands using Athena on their own data; founders who'd act on their plan | ≥ 5; ≥ 1; ≥ 3 of 5 |
| Uptime | Through 17 Nov | ≥ 99% |

**The 5-second test:** show the Places block with Without Qloo flipped for 5 seconds to someone who has never seen Athena, then ask what it shows. It passes if they say, in their own words, that the chatbot's picks are more generic or partly wrong, and Athena's come with evidence.

**The QA checklist** runs for each tuned category and each demo recipe, on 2 brands in 2 metros:

1. Every block in the recipe clears its thin threshold (§9.11).
2. No chain, closed venue or direct competitor appears in any top 10.
3. At most 2 of the top 10 partners sit above Qloo's 99th popularity percentile, so the list names specific partners, not just famous ones.
4. Every evidence chip and every enrichment opens its call.
5. Every date in Moments shows a source.
6. Where a founder call exists for the category, the founder says they'd act on at least 3 items.

**After the hackathon (for the pitch):**

- the reply rate of Athena drafts against the brand's usual outreach;
- wins per field day, or per 10 inquiries;
- the reorder or renewal rate at 60 days.

---

## 17. Timeline and cut ladder

Two builders, both part-time: Siddhant and Jaiaditya. The default split [DECISION: who takes which half]:

- **Builder A:** the Qloo client, playbooks, methods, external sources, the agent, and the ranking check.
- **Builder B:** the map, motion, the six block views, the "Try this" card, the phone layout and write-up assets.

Both join the founder calls, the QA checklist and the rehearsals.

| Dates | Work |
|---|---|
| 7–8 Oct (done) | Repo with the MIT license; Next.js scaffold; Qloo key verified; stockist CSVs for 10 brands; key-day spike S1–S16 and the tuning-brand blind test (§10.1, §18) |
| 9–10 Oct | Google Cloud project (done 8 Oct: project `athena-qloo`, credit expiry 7 Jan 2027, budget alerts, payment method, Cloud Run and Vertex AI enabled): enable Firestore, BigQuery, Secret Manager and Cloud Build, then deploy the hello page to Cloud Run. Sign up for free keys: Ticketmaster, Census; apply for the Google Trends alpha. Run S17–S22. Fixtures for all three recipes and all six blocks. The UI shell |
| 11–13 Oct | Qloo client (cache, pool ≤ 50, unscored handling). Read card, including website reading (§9.20). Markets with Census and Overture neighbourhoods. Places with contacts. First email to the demo brands |
| 14–16 Oct | Partners: mutual fit, Who listens, Apple Podcasts, Wikidata. Without Qloo with checks and the §10.2 metrics. Trace. **Compute the ranking-check metric on Brightland, then commit `prereg-v2` by 16 Oct** |
| 17–19 Oct | Message: themes, references, positioning, audience skew, hooks, the validator. Moments: Ticketmaster shows, festivals with Search-grounded dates. Run the ranking check on the 3 test brands |
| 20–22 Oct | Act: drafts, route, pipeline, re-rank. Timeleft and Master & Dynamic recipes live. The warm-cache job (§14.9) |
| 23–25 Oct | Try your own brand end to end; quality gates, Beta badges, caps, phone layout. P1 items if on schedule: mood board, MCP server. The §10.2 metrics for all demo brands (G2) |
| 26–27 Oct | QA checklist; 5 fresh-browser rehearsals; 5-second and versatility tests; video from a real session; README, Devpost text, Method and Sources pages, GIFs, Qloo diagram |
| 28 Oct | **Submit.** |
| 29–30 Oct | Fixes only. |
| 31 Oct, 9:15 AM IST | Deadline. |
| Until 17 Nov | Keep it live and free. Check credit spend weekly. |
| 17 Nov | Judging ends: delete the Cloud Run service and Firestore data (§14.8). |

**Cut ladder.** Check progress on 16, 19 and 22 Oct. If behind, drop in this order:

1. Any P1 not started yet (F28–F36).
2. The fifth tuned category. Stay at four.
3. The mood board (F28) and the MCP server (F29).
4. Apple Podcasts and Wikidata enrichments, and public podcast numbers. Podcasts and brands show without contact details.
5. Festivals in Moments. Shows only.
6. The reverse side of mutual fit. Forward rank only.
7. The hardware demo. Keep the app demo.

**Never cut:**

- the Read card and the recipe engine;
- Markets, Places and Partners;
- Message themes and references;
- Without Qloo on Places, and the comparison line;
- trace links and source labels;
- live runs with the labelled fallback, and the warm cache;
- the validator and the re-rank;
- the ranking check, run and published whatever the result;
- a minimal *Try your own brand*;
- the phone list view.

---

## 18. Key-day spike

S1–S16 ran on 8 Oct against the hackathon endpoint, using only the tuning brand (Brightland) as a signal. The scripts are in `scripts/spike/`; responses are cached in `.cache/`, which is git-ignored.

| # | Check | Pass if | Result on 8 Oct | Action taken |
|---|---|---|---|---|
| S1 | `GET /` and one insights call | Both return 200 | ✅ Pass | — |
| S2 | Resolve the tuning brand's and a hero candidate's stockists | ≥ 60% matched, ≥ 95% precision | ❌ 52% NYC, 47% LA (Brightland); 57% (Fishwife sample of 40); precision 24 of 25 certain, 1 likely | The matcher (§9.1) is kept. Overture shows the unmatched venues on the map, labelled (§9.19) |
| S3 | Venue-type tags with ≥ 20 venues in NYC, LA and Chicago | Found, ≥ 20 in each | ✅ cafés, coffee shops, bakeries, brunch, delis, gift shops, gyms, spas, art galleries, wine, cheese, health food. ❌ gourmet grocery (Chicago 18), yoga studios (Chicago 15), candle stores, boutique hotels (≤ 3), concept stores (0) | §7.3 channels updated; boutique hotels and concept stores removed |
| S4 | Metro ranking with `diversify.by=properties.geocode.metro` | ≥ 8 metros | ✅ 14 metros | — |
| S5 | Heatmap cells and neighbourhood names | Both returned | ⚠️ 577 cells; `output.heatmap.boundary` accepts only `urn:geohash` or `urn:entity:locality`, and locality returned 500 | Neighbourhood names from Overture polygons (§9.4) |
| S6 | `feature.explainability` on places | Contributions present | ✅ 20 of 20 | — |
| S7 | `filter.results.entities` with 100 IDs | Works | ⚠️ `take` maximum 50; a 50-ID pool returned 33 scored | Pools are ≤ 50; unscored handling in §9.7 |
| S8 | `audience_growth` on places | Present | ✅ values present | "Crowd growing" chip kept |
| S9 | Brand recommendations from place signals | ≥ 20 food and drink brands | ⚠️ 50 brands, 4 food and drink; mostly lifestyle (Madewell, Goop, Warby Parker) | Lifestyle brands accepted as bridges (§9.8) |
| S10 | Several values in `filter.tag.types` | Works | ✅ HTTP 200 (my first parse was wrong: results carry `types` and `subtype`, not `type`) | Filter by `subtype` in code |
| S11 | Backtest on the tuning brand | Athena beats most popular | ❌ 1 of 87 vs 0–1 across 9 variants | Hit counts dropped (§10.1) |
| S12 | Latency | p95 < 3 s per call | ❌ places 7–27 s; search 3 s; brand recs 4.5 s; tags 1 s | Warm cache, streaming, revised speed targets (§14.9) |
| S13 | Demo app and hardware brands resolve | Found, right category | ✅ Timeleft, Meetup, Hinge, Bumble; Master & Dynamic, Marshall Headphones, Sonos, Skullcandy. ❌ Partiful, Teenage Engineering | Demo brands chosen (§7.7) |
| S14 | Partner quality with the reach window | ≤ 2 of top 10 above the 99th percentile | ✅ 0; 20 podcasts | — |
| S15 | Reverse mutual-fit call with 15 peers | All ranked | ✅ 15 of 15 | — |
| S16 | `POST /v2/insights` | Optional | ✅ works | — |
| Extra | Themes, cultural references, demographics, festivals, shared-pool tags | Return data | ✅ all five (§11.1, Q13–Q17) | Message and Moments blocks added |
| Extra | `/v2/trending`, locality month tags, `/v2/analysis/compare` for a small brand | Return data | ❌ empty, absent, empty | Ticketmaster and grounding for timing; shared-pool positioning |
| Extra | Signal for Markets, Partners, Message, Moments: 50 NYC accounts vs the Brightland entity | The plan reads as Brightland's | ❌ accounts: off-category; ✅ brand: on-category (table in §7.5) | Brand-led signal for those four blocks (§7.5) |
| Extra | Qloo audiences: `urn:audience` output, `signal.demographics.audiences`, `signal.interests.tags` | Return data; signals change results | ✅ audiences ranked (10 types). ❌ audience signal: 0 of 20 changed. ⚠️ tag signal: 19 of 20 unchanged with the brand; generic alone | Audience interests added to Message with an allow-list (§9.17, Q20); neither signal used (§11.1) |

**Still to run (9–10 Oct):**

| # | Check | Pass if | If it fails |
|---|---|---|---|
| S17 | Vertex AI on the Free Trial, `global` endpoint: 20 parallel `gemini-3.8-flash` calls, and one `gemini-3.1-pro-preview` call with Search grounding | No throttling; grounding returns sources | Serialise LLM calls; lean on the cached fallback. **Partly run on 8 Oct:** single calls to both models work on `global` (404 on `us-central1`); grounding returned sources. The 20-call burst is still to run |
| S18 | The trial account queries `bigquery-public-data.overture_maps` (place and division tables); scan size for one metro | Query succeeds; ≤ 50 GB scanned per metro extraction | Use OpenStreetMap Nominatim for coordinates only, and show "Neighbourhood names unavailable" |
| S19 | Ticketmaster: events for 5 Qloo artists in 3 metros, next 120 days | ≥ 3 events for at least 2 demo brands | Moments shows festivals only |
| S20 | Census API: population and income for the 25 metro CBSA codes | 25 of 25 returned | Show "Census data unavailable" |
| S21 | Apple Podcasts and Wikidata lookups for 10 Qloo podcasts and 10 Qloo brands | ≥ 7 of 10 found each (8 Oct: Apple 8 of 8 Brightland podcasts) | Hide the missing fields |
| S22 | Gemini URL context on 10 startup websites | Category and tier right for ≥ 8 of 10 | Fall back to the description field |

---

## 19. Risks

| Risk | Mitigation |
|---|---|
| The ranking check fails too | It's pre-registered. The failure is published; the pitch stands on With Qloo vs Without Qloo and versatility (§10) |
| The Without Qloo difference looks small for some brand | The metrics are computed for every demo brand by 25 Oct (G2); a weak result is published, not hidden; the demo brand can be swapped under the §7.7 rules before submission |
| Thin Qloo coverage of small venues (about 50%, S2) | Overture shows unmatched accounts on the map; demo signals use only resolved venues; the thin-results label; the recovery ladder |
| Qloo latency (7–27 s per places call, S12) | Warm cache for the demo brands; streaming; parallel calls; page 2 on demand (§14.9) |
| Qloo limits: pools ≤ 50, about a third unscored (S7) | Pools ≤ 50; unscored handling (§9.7); the share scored reported in the ranking check |
| The LLM baseline looks like a straw man | Gemini 3.1 Pro with Search grounding, the same schema, the published prompt and date |
| The versatility demos look shallow | Each passes the QA checklist; the versatility test; six blocks per demo |
| Judges type brands in untuned categories | The Beta badge, the thin-results label, honest out-of-scope reasons |
| Partner lists look generic (just famous names) | The reach window, price-tier matching, the "most obvious" metric, QA rule 3 |
| Message reads as generic marketing copy | Every hook and tone line cites Qloo evidence through the validator; references come with their Qloo rank |
| Audience skew is misread as customer data | The fixed label text (§9.17), hidden when weak, never used for ranking or targeting, a code test |
| Audience interests surface sensitive groups (ethnicity, sexuality, religion, politics appeared in Brightland's unfiltered top 10) | The four-type allow-list (§9.17), a code test over every audience type, the fixed label |
| Moments finds few dated events | Shows plus festivals; the thin label; undated festivals listed as "date unknown"; no date without a source |
| Ticketmaster terms: no revenue, revocable licence | Free hackathon app only; called on user action; 24 h cache; removal within 24 h on request; festivals as fallback; a commercial agreement before any paid tier (§4.6) |
| Overture can't be queried on the trial, or scans are large | S18 on 9–10 Oct; one bounded extraction per metro; fallback to Nominatim coordinates and "Neighbourhood names unavailable" |
| A free external API goes down or changes during judging | Every enrichment is optional; missing values show "not found"; cached values carry their date |
| Website reading is manipulated by page content | URL context only; page text treated as data; a strict output schema; the validator; the user confirms the card (§9.20) |
| Breadth eats the schedule | The build rule (six blocks only); the work split (§17); the cut ladder, checked on 16, 19 and 22 Oct |
| Public traffic runs up costs | Per-IP and daily caps (§14.5); Cloud Run's maximum instances is 3; budget alerts at $50, $150 and $250 (§14.8) |
| The credit runs out or expires before 17 Nov | It ends 7 Jan 2027 (checked 8 Oct); the budget is about $165 of $300; a non-billable Free Trial account stops resources rather than charging a card |
| Vertex AI quotas on the Free Trial throttle live runs | S17; serialised LLM calls; cached demo-brand results; the labelled fallback |
| Gemini's quality falls short of Claude's for the agent or drafts | The grounding validator (§9.10), the QA checklist (§16), and a swappable provider: Claude can be added through the Claude API, billed separately (§12.8) |
| Gemini 3.8 Flash's introductory price ends on 1 Jan 2027 | After judging ends, so it doesn't matter |
| `gemini-3.1-pro-preview` changes or is retired during judging | The model ID is one config value; the cached Without Qloo answers for demo brands don't need the model; the Method page records any change (§12.8) |
| The billing account loses its valid payment method | Billing → How you pay is checked weekly with the credit spend; without it, every Vertex call fails with 403 (§14.8) and the app falls back to the last live run |
| The live app fails during judging | Warm cache, health checks, uptime alerts, and the labelled fallback to each brand's last live run |
| Being lumped in with "market insights" tools | The output is named venues, partners, cities, events, drafts and routes; "insights" is banned in copy |
| A real brand objects to being shown | The disclaimer; ask first; anonymise on request |
| Live results drift as Qloo's data updates | Results carry their date; the Method page states the date of every published number |

---

## 20. Submission

### 20.1 Checklist

- [ ] Live URL, no login; the app is live on arrival, and the "Try this" path works on desktop and on a phone
- [ ] Deep links from the Devpost page to the Without Qloo comparison and to each demo brand
- [ ] Public repo; MIT license visible in About; setup from a clean machine; `.env.example` only; tests run with one command
- [ ] Devpost text (§20.2) with the real computed numbers, including the failed blind test
- [ ] Redacted request → result examples: one bridge, one mutual fit, one positioning card and one moment, each traced to its calls
- [ ] Screenshots with no keys or personal data: Places with Without Qloo flipped, a venue drawer, the Message block, the Moments block, the trace, the re-rank, a draft, the app plan, the hardware plan
- [ ] GIFs of the Without Qloo flip, the re-rank and the brand switch (the panel reordering itself)
- [ ] The "How Athena uses Qloo" diagram (`docs/QLOO.md`), showing which gaps each other source fills
- [ ] The Sources page with every attribution (§15)
- [ ] The demo disclaimer for real brands
- [ ] A 2-minute video recorded from a real session, following the "Try this" card
- [ ] Both owners, Siddhant and Jaiaditya, are on the Devpost project team before submitting
- [ ] Free to test through 17 Nov; the billing account still a non-billable Free Trial account

### 20.2 Devpost write-up outline

The headings mirror the judging criteria, so both people and automated screeners find each answer.

1. **The line and the comparison:** "Same question, two answers", with the hero's computed numbers.
2. **The problem:** Maya, Dev and Lena.
3. **What it does:** the six blocks, the key moments, the two versatility demos, and *Try your own brand*.
4. **Technological implementation:** the Qloo capabilities table (§11.1), the methods, one bridge, one mutual fit and one positioning card traced to their calls, the gap-filling sources (§11.2), the tests.
5. **Evidence:** With Qloo vs Without Qloo for every demo brand; the failed blind test and what we changed; the ranking check's registered result; what isn't measured.
6. **Design:** a live app on arrival, the "Try this" guide, one screen that rearranges itself, phones, accessibility.
7. **Potential impact:** three users, quotes from real brands, a market across goods, tech and apps, the business model and its data terms.
8. **Quality of the idea:** places and partners as a taste fingerprint; lookalike places, partners and moments; mutual fit; outcomes as signal.
9. **Responsible use**, including the audience-skew and audience-interest rules.
10. **What we don't know.**
11. **Built with, setup and testing:** "No login. The app is live when you arrive: follow the **Try this** card, or try your own brand."

### 20.3 Emphasis by judge

| Judge | Lead with |
|---|---|
| Jason Calacanis | The 1-to-n story, the market across goods, tech and apps, the real brand using it, who pays |
| Mike Diolosa (Qloo CTO) | The Method page, the trace and the per-block Qloo call counts, the 15 Qloo capabilities, the honest key-day findings, shared-pool positioning |
| Nicole Seligman | No customer modelled, no individual targeted, the audience-skew and audience-interest rules, human approval, the allow-list, alcohol out of scope |
| Michael Abrams (Live Nation) | Moments: the crowd's Qloo-ranked artists joined to their dated Ticketmaster shows, and the partnership demo |
| Todd Boehly, Cedric the Entertainer | The Without Qloo flip, Message's cultural references, the two-minute story |

### 20.4 Pitch lines

- "Athena: the taste-led growth agent for consumer startups."
- "Meta gave brands lookalike audiences. Athena gives them lookalike places, partners and moments."
- "Grow where your crowd's taste already is."
- "From your first stockist to your nth market."
- "Same question, two answers: one guesses, one shows its evidence."

---

## 21. What we don't know

- **Causation:** whether a taste match causes stocking, bookings or collabs. Athena ranks whom to approach; price, margin, distribution and timing decide the rest.
- **Ranking accuracy:** the stockist blind test failed (§10.1). Whether the ranking check passes (§10.3) is open until it runs.
- **Coverage:** Qloo has about half of the small independent venues we tested (§18, S2). Results for brands that sell mainly through tiny boutiques are thinner.
- **Partners:** whether two-sided taste fit predicts that a collab happens, or works.
- **Message:** whether taste-grounded hooks and references perform better than a founder's own copy. Nothing in Message is measured.
- **Moments:** whether showing up at a taste-matched event drives sales. Ticketmaster covers ticketed events only; festival dates depend on web sources.
- **Audience skew:** Qloo's demographics describe a taste panel, not a brand's customers.
- **Launch order:** whether taste-ranked launch cities beat population-ranked ones for apps.
- **Other countries:** whether any of this holds outside the US.
- **Declines:** whether learning from declines improves results. Only the mechanics are shown, because no real decline data exists yet.
- **Bridges:** whether they raise reply rates.
- **Data drift:** how far Qloo's regular data updates move live results away from the published ones.

---

## 22. Open decisions (defaults in bold)

1. **Name and title:** Athena: the taste-led growth agent for consumer startups (decided).
2. **Demo brands:** **Brightland (goods), Timeleft (app), Master & Dynamic (hardware)** (§7.7). Alternatives: Meetup for the app, and Marshall Headphones or Sonos for hardware.
3. **Ranking-check test brands:** **Fishwife (G1), Rishi Tea (G2), Paddywax (G4)**, registered in `prereg-v2` by 16 Oct. MUD\WTR is the G2 alternative.
4. **Fifth tuned category:** **G4 home** (Paddywax has 13 qualifying metros), replacing the earlier G3 default. Beauty stays Beta: only Juniper Ridge qualified, in 2 metros.
5. **Target metro for the goods demo:** **Brightland: New York accounts → Los Angeles.**
6. **Models:** **Gemini 3.8 Flash (`gemini-3.8-flash`) for the agent, Gemini 3.1 Pro (`gemini-3.1-pro-preview`) for draft retries and Without Qloo (with Search grounding), all on Vertex AI's `global` endpoint**, paid from the credit (§12.8). Claude can be added later through the Claude API, billed separately.
7. **Decline weight λ:** **0.5**.
8. **Bars:** **off by default in every category**; founders can add them on the card.
9. **Partner types:** **brands and podcasts** (P0); artists and TV shows as shared loves only (P1).
10. **Reach window:** **`filter.popularity.max` = 0.97** for pre-launch and early brands.
11. **Hosting:** **Cloud Run (1 warm instance, request-based billing) with Firestore, BigQuery, Secret Manager and Cloud Build, in `us-central1`; Gemini calls on the `global` endpoint**, all paid from the $300 Google Cloud credit (§14.1, §14.8).
12. **Real brand names in demos:** **yes, with the disclaimer and outreach**; anonymise on request.
13. **Caps:** as in §14.5.
14. **Price points to test:** **$99 and $299 a month.** Moments shows in a paid tier need a Ticketmaster agreement first (§11.2).
15. **Who builds what:** the split in §17, assigned between Siddhant and Jaiaditya.
16. **Audience skew and audience interests:** **shown, under the rules in §9.17** (decided 8 Oct); interests limited to **hobbies and interests, leisure, spending habits and professional area**.
17. **Competitors for positioning:** **the user's (up to 3); otherwise the top 2 peers from the mutual-fit peer set (Q10).**
18. **Signal per block:** **brand entity plus comparables for Markets, Partners, Message and Moments; accounts for Places and the Read card** (decided 8 Oct, §7.5).

---

## Appendix A. Example requests (redacted)

Angle brackets are placeholders. Qloo requests go to `https://hackathon.api.qloo.com` with the header `X-Api-Key: <server secret>`. Every Qloo request below was run successfully on 8 Oct unless marked [VERIFY].

```http
# Q1  Resolve a stockist (address first, then location)
GET /search?query=<cleaned venue name>&types=urn:entity:place&filter.address=<street>&take=5
GET /search?query=<cleaned venue name>&types=urn:entity:place&filter.location=<lat>,<lon>&filter.radius=0.5&take=5

# Q2  Resolve a brand
GET /search?query=<brand name>&types=urn:entity:brand&take=5

# Q4  Fingerprint
GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<signal>&filter.tag.types=<allow-list>&take=20

# Q5  Metros
GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<signal>&filter.tags=<channels>&operator.filter.tags=union&diversify.by=properties.geocode.metro&diversify.take=4&take=50&filter.exclude.location.query=New York City

# Q6  Taste heatmap (geohash cells only)
GET /v2/insights?filter.type=urn:heatmap&filter.location.query=Los Angeles&signal.interests.entities=<signal>

# Q7  Places (page 2 only on "Show more")
GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<A>&filter.location.query=Los Angeles&filter.tags=<channels>&operator.filter.tags=union&filter.price_level.min=2&filter.price_level.max=4&filter.exclude.entities=<A>&feature.explainability=true&take=50&page=1

# Q8  Score a fixed pool (≤ 50 IDs; some may come back unscored)
GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<signal or D>&filter.results.entities=<≤ 50 IDs>&take=50

# Q9  Partner brands
GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<signal>&filter.exclude.entities=<own brand, competitors>&filter.popularity.max=0.97&take=50

# Q10 Peer set, then the reverse side of mutual fit
GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<your brand>&filter.tags=<narrowest genre tag>&filter.exclude.entities=<your brand>&take=14
GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<partner>&filter.results.entities=<your brand + 14 peers>&take=15

# Q11 Podcasts
GET /v2/insights?filter.type=urn:entity:podcast&signal.interests.entities=<signal>&filter.popularity.max=0.97&take=20

# Q12 Bridges for one venue
GET /v2/insights?filter.type=urn:entity:brand&signal.interests.entities=<venue>&filter.results.entities=<brand set>&take=50

# Q13 Themes
GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<signal>&filter.tag.types=urn:tag:theme:qloo&take=10

# Q14 Cultural references (repeat for movie, artist, book)
GET /v2/insights?filter.type=urn:entity:tv_show&signal.interests.entities=<signal>&filter.popularity.max=0.99&take=5

# Q15 Positioning: score a shared tag pool under one brand's signal (repeat per brand)
GET /v2/insights?filter.type=urn:tag&signal.interests.entities=<brand signal>&filter.results.tags=<≤ 50 tag IDs>&take=50

# Q16 Audience skew
GET /v2/insights?filter.type=urn:demographics&signal.interests.entities=<signal>

# Q20 Audience interests (keep only the four allow-listed types, §9.17)
GET /v2/insights?filter.type=urn:audience&signal.interests.entities=<signal>&take=50
GET /v2/audiences?filter.audience.types=urn:audience:hobbies_and_interests&take=50

# Q17 Festivals in the target metro
GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<signal>&filter.tags=urn:tag:genre:place:festival&filter.location.query=Chicago&take=10
```

**External requests** (keys from Secret Manager; [VERIFY] until S18–S22 pass):

```http
# Census: metro population and median household income [VERIFY S20]
GET https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area:<CBSA>&key=<key>

# Ticketmaster: an artist's upcoming shows in a metro [VERIFY S19]
GET https://app.ticketmaster.com/discovery/v2/events.json?keyword=<artist>&classificationName=music&dmaId=<dma>&startDateTime=<ISO>&endDateTime=<ISO>&size=5&apikey=<key>

# Apple Podcasts: a podcast by the Apple ID in Qloo's external.itunes (tested 8 Oct)
GET https://itunes.apple.com/lookup?id=<Apple ID>
    (trackCount, releaseDate, primaryGenreName, collectionViewUrl, feedUrl; then the feed's channel <link> and <itunes:email>)

# Wikidata: a brand's website and socials [VERIFY S21]
GET https://www.wikidata.org/w/api.php?action=wbgetentities&ids=<QID>&props=claims&format=json
```

```sql
-- Overture: neighbourhood polygons and places for one metro's bounding box [VERIFY S18: table and column names]
SELECT id, names.primary AS name, subtype, geometry
FROM `bigquery-public-data.overture_maps.division_area`
WHERE subtype IN ('neighborhood', 'macrohood')
  AND ST_INTERSECTSBOX(geometry, <min_lon>, <min_lat>, <max_lon>, <max_lat>);
```

## Appendix B. LLM contracts

```ts
// classify_business
{ category: "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8"
          | "T1" | "T2" | "T3" | "A1" | "A2" | "A3" | "A4" | "L1" | "out_of_scope";
  tier: "mass" | "mainstream" | "premium" | "luxury";
  motions: ("venue" | "retail" | "city_launch" | "partnership" | "location_opening")[];  // ordered
  comparables?: string[];  // 3 suggestions when there are no accounts and Qloo lacks the brand; the user confirms
  confidence: number;      // 0–1
  why: string }            // ≤ 120 characters

// read_website (§9.20; Vertex URL context)
{ category: string; tier: string; products: string[];            // ≤ 5
  description: string;                                            // ≤ 160 characters
  stockists: { name: string; address: string; city: string }[];  // ≤ 50
  competitors_mentioned: string[] }                               // ≤ 3

// parse_accounts (text, CSV or image)
{ rows: { name: string; address: string; city: string }[]; skipped: string[] }

// build_message hooks (checked by the validator, §9.10)
{ hooks: { text: string /* ≤ 12 words */; claims: Claim[] }[];          // 5
  content_ideas: { text: string /* ≤ 25 words */; claims: Claim[] }[];  // 5
  tone_line: { text: string; claims: Claim[] } }

// festival date (Gemini with Search grounding, §9.18)
{ date: string | null /* YYYY-MM-DD */; source_url: string | null }

// draft_outreach (checked by the validator, §9.10)
{ kind: "venue_pitch" | "buyer_pitch" | "event_inquiry" | "collab_inquiry" | "sponsorship_inquiry";
  subject: string;
  sentences: { text: string; claims: Claim[] }[] }

type Claim = { kind: "venue" | "account" | "brand" | "podcast" | "tag" | "theme" | "reference" | "event" | "number";
               ref: string; value?: number };

// llm_only (Without Qloo: Search grounding on, Qloo tools off). Fields follow the block.
{ metros?: string[];                                                     // ranked; 8
  venues?: { name: string; address: string; why: string }[];             // ranked; 20; independent and open
  partners?: { name: string; kind: "brand" | "podcast"; why: string }[]; // 10 brands + 5 podcasts
  message?: { themes: string[]; references: string[]; hooks: string[] }; // 6, 6, 5
  moments?: { name: string; date: string; source_url?: string }[] }      // 5

// every tool call
{ why: string /* ≤ 90 characters, shown in the rail */, ...args }
```

---

## Sources

1. [Brands losing a record $29 for each new customer acquired (SimplicityDX via BusinessWire, July 2022)](https://www.businesswire.com/news/home/20220719005425/en/Brands-Losing-a-Record-29-for-Each-New-Customer-Acquired)
2. [DTC brands brace for more anti-tracking changes after iOS 14.5 (Marketing Dive)](https://www.marketingdive.com/news/were-going-back-to-the-drawing-board-dtc-brands-brace-for-more-anti-tra/606607)
3. [Faire valuation grows to $12.4 billion (BusinessWire, November 2021)](https://www.businesswire.com/news/home/20211116005386/en/Faire-Valuation-Grows-to-12.4-Billion-With-400-Million-Series-G-Funding-Round-Co-Led-by-Durable-Capital-Partners-LP)
4. [Faire company profile (Contrary Research)](https://research.contrary.com/company/faire)
5. [Consumer startups in Q1 2025 (Carta)](https://carta.com/data/industry-spotlight-consumer-q1-2025/)
6. [Qloo API documentation](https://docs.qloo.com)
7. [Qloo Agentic Hackathon rules](https://qloo.devpost.com/) · [Hackathon kit](https://github.com/qloo/qloo-hackathon-kit)
