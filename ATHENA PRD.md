# Athena: the taste-led growth agent for consumer startups

*Plans a consumer startup's growth from 1 to n: where to grow, which venues to be in, who to partner with, what to say and when to show up, from what its customers already love.*

**Product Requirements Document**

| | |
|---|---|
| Version | 5.0 (plan) · 14 Oct 2026 |
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
| New in v2.13 | **Try your own brand becomes a conversation, not a form** (§6.2). It opens on a brief canvas: one text box (required) plus optional files of any common kind (images, PDF, Excel/CSV, PowerPoint, Word). Athena turns everything into one structured brand brief (§9.22), shows what it understood, fills the required facts from Qloo or the website where it can and asks for a one-tap confirmation, and asks follow-up questions only for what it still can't find. While the plan runs, it asks up to three inline questions only when the brief left a gap, never waiting: it assumes a default, keeps going, and re-runs only what an answer changes. |
| New in v2.14 | **A landing page and a way in** (§2.2). `/` is now a landing page: a hero that says what Athena does, the six parts of the plan, how it works, and one **Start planning** button. It leads to `/start`, where the visitor picks **Try your own brand** (which opens the brief canvas, §6.2) or one of the three demo brands (which opens its workspace). The workspace moves to `/<brand>`. |
| New in v3.0 | **The taste model is the centrepiece, and the whole product is a journey.** (1) **Intake asks about the product, not the customer** (§6.2): what it is, price, what it's made of, how it looks, when it's used, where it's sold. Athena turns those traits into Qloo signal itself. (2) **Online or offline** is asked (with Athena's guess) and shapes the options. (3) **Growth types replace motions as the founder's choice** (§7.8): Deepen, New city, New crowd, Borrow a crowd, Show up, Online, Own location; up to 3. (4) **A taste graph built from Qloo affinities splits the brand's crowd into 2–3 crowds** (§9.23), each with its own cities, loves, partners and audience skew; the founder's reactions re-weight it. (5) **City is no longer a required input:** it's an output of the crowd, asked only when a growth type needs it. (6) **The plan is a step-by-step journey** (§13.1–13.2): each stop is a decision with options, waits for the founder, and carries choices forward. (7) **The dashboard is the advanced view** and where the pipeline is worked (§13.2). (8) **Demos become context packs** (§7.7): ready-made material that judges drop in and watch run live: three real brands built only from public material (Brightland for the offline path, Starface for the online path, Fishwife for a brand Qloo doesn't know), nothing fictional; (11) **Retail step-up** (§9.25): Deepen also ranks the bigger retailers that fit the crowd and that the brand isn't in yet; the real-brand demo workspaces and the "Try this" card are removed. (9) **Responsible-use rules updated** (§3.2, §9.17, §15): creators can be partners in their professional role, like podcasts; the Online stop suggests allowed audience interests and, when clear, the age and gender skew as ad audiences *to test*; sensitive audience types stay banned and no private individual is ever a target. (10) **Qloo's limits measured** (10 Oct): 5 calls a second and 10,000 a month on our key; one shared pacer holds the per-second limit (§14.9). Weighted signals and person entities tested live (§11.1, Q21–Q25). |
| New in v3.1 | **What the first build changed** (10 Oct). (1) **No blind guessing** (§6.2.1): the channel comes only from the founder's words or a cited source; "Not sure" now means "look it up for me", and missing facts are researched or asked, never guessed. (2) **Any US metro** everywhere, with self-describing metro ids and Census matched by metro name (§9.3). (3) **Seed:** tags join only when fewer than 2 lookalikes are found, and first-ring calls are capped at 15 s (§9.23). (4) **Next retailers:** curated pools per category; Qloo's own retail picks only for general goods (§9.25). (5) **Message drops sensitive themes** (§9.15). (6) **Speed:** Who listens on the top 3 podcasts, Partners streams as its calls land, and the journey prefetches the next stop (§14.9). (7) A journey counts once against the own-brand cap (§14.5). |
| New in v3.2 | **Crowd reactions now change the plan** (§9.23 step 7): the chosen crowd leads at weight 3, a "Partly" crowd's top 6 entities join at 1.5, a "Not us" crowd's top 8 are excluded from every ranking, and unreacted crowds stay out. **New crowd plus other picks asks one question at the Crowd stop** (§7.8): do the other picks target the current crowd or the new one? |
| New in v4.0 | **Qloo as a measuring instrument, a measured test against an LLM, and a taste map founders can touch** (12 Oct). (1) **Taste engine** (§9.23): about 100 controlled Qloo probes per brand over 6 domains form a percentile matrix; crowds come from spectral clustering with bootstrap confidence and are checked against shuffled data, so only each crowd's **core** is claimed; **specificity** sorts what a crowd loves beyond its fame. Every method uses only the order within each Qloo response. (2) **The Taste Bench** (§10.6): Athena vs one naive Qloo call vs Gemini alone vs popularity, on where to launch, which retailer next and which venues, scored against the brands' real stockists; registered in `prereg-v2` by 16 Oct and published whatever it shows. (3) **The Taste Galaxy** (§13.11): the crowds as a map that forms live while the agent probes; hover for why, pin "us" or "not us", answer the agent's one question. (4) **Two Qloo keys** (§11.1, §14.9): 10 calls a second and 20,000 a month, routed by headroom with failover. (5) **Planned 17–25 Oct:** crowd geography with hotspots, taste axes, bridges and why-paths (§9.26–9.29), and With / Without on every stop (§13.2). (6) **Cut after live probes on 12 Oct:** trends and compare (§11.1). |
| New in v4.1 | **The Bench's main tests change, and Markets ranks cities on the crowd's brands** (13 Oct, after the tuning run). (1) **Two layers, stated plainly** (§10.6): Qloo's taste graph makes every measurement and ranking; Gemini reads the brand at the start and writes the plan from Qloo's findings. (2) **The Bench's primary tests** are now Athena vs one raw Qloo call and vs popularity: what Athena's methods add to Qloo, and whether Qloo's taste beats fame. Gemini alone, with and without Search, stays registered as a secondary comparison and is published in full; on the tuning brands it ranked retailers and venues better than Athena (§10.6). (3) **Markets** scores each of the 25 named metros on the crowd's brands, one location-signal call per metro (§9.3): Spearman 0.73 and 0.62 against stockist density on the tuning brands, up from 0.21 and 0.40; any-metro stays in the fallback and in typed places. (4) **The ranking check's pool** pairs each stockist Insights can see with a decoy matched on kind and popularity (§10.3), because random same-type decoys were told apart by fame alone. (5) Ranking-check brands fixed: McClure's, Rishi Tea, Paddywax (§22). |
| New in v4.2 | **Proposed (14 Oct): the Brand Graph and Plays.** (1) **The Brand Graph** (§13.12) replaces the static "What I understood" card: a slim strip of facts, with Athena's understanding below it as a growing graph built on the Taste Galaxy. It is edited directly or through the chat box, and edits re-run only the plays they touch. (2) **Plays** (§13.13): the journey's entry points, as a catalogue grouped by the founder's question, run from one registry so new features are one entry. §7 stays hidden; plays are the founder's view of it. |
| New in v5.0 | **Plan for the next version (14 Oct), §23.** The founder's six problems with v4, verbatim (§23.1), and the build order (§23.2): (0) **Athena becomes an agent:** Gemini calls Qloo and real-world tools in a loop with a goal, a budget and hard caps, the fixed pipeline as fallback. (1) **The Galaxy ranks the most valuable fits** on a combined score over six parameters plus timing, with a strategy for each; the question, pins and reactions go. (2) **Date and season awareness** across three calendars and every horizon. (3) **Onboarding becomes an agentic playground** with our own safe crawl, a knowledge base of uploaded files and a bring-your-context prompt; the "server never fetches user URLs" rule is replaced (§9.20, §14). (4) **The Brand Graph** (§13.12) with tiers, sources and timing on nodes. (5) **Goals, not a fixed path:** the agent proposes goals the founder picks; plays become its tools (§13.13). Where §23 conflicts with earlier text, §23 wins. |

**How to read this document**

- **P0** ships for the demo. **P1** ships if on schedule. **P2** ships only with spare time.
- **[VERIFY]** means: not yet confirmed against the live service. **[DECISION]** means: a default is set, and it's yours to change (§22).
- **"Measured on 8 Oct"** marks a number from the key-day spike (§18). Any number marked *illustrative* is a placeholder that never ships.
- **Source labels:** every value on screen carries one source label: **Qloo**, **Census**, **Overture**, **Ticketmaster**, **Apple Podcasts**, **Wikidata**, **Web** (Google Search grounding) or **Agent** (LLM-written text). The label is part of the requirement, not decoration.

---

## 1. Summary

**One line.** A founder describes their product and picks how they want to grow. Athena reads the product into Qloo's taste graph, finds the crowds who'd love it, and walks the founder through a growth plan one decision at a time: which crowd, where they are, which places, who to partner with, what to say online, when to show up. Every pick carries Qloo evidence, the venue picks can be compared side by side with a chatbot that has no Qloo access, and the plan re-ranks from the founder's wins and declines.

**Problem.** Consumer companies grow by deciding where to show up next, who to partner with and what to say: the cafés that should stock a snack brand, the city a social app should launch in next, the brands a headphone company should collaborate with, the podcast worth sponsoring, the festival worth a pop-up. Paid social got more expensive and harder to measure, so these decisions now carry more of the growth. They're still made with Google Maps, gut feel and whoever answers a cold email.

**Insight.** *A brand's places and partners are its customers' fingerprint.* Qloo may never have heard of a $3M snack brand, but it knows the cafés that stock it and what their crowds love, across venues, cities, brands, podcasts, TV, film, music and books. Twelve accounts, or three comparable brands, become a taste signal Qloo can read anywhere.

*A product's traits and the brands it resembles are a key into the taste graph.* A founder doesn't know what their customers listen to; Athena works it out. Product traits become Qloo tags and lookalike brands; Qloo's cross-domain affinities expand them into a graph of what that crowd loves; the graph splits into distinct crowds the founder can choose between (§9.23).

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

**v3.0: one engine, one journey.** The six blocks stay as the engine. The founder sees them as stops on a step-by-step journey, chosen by the growth types they pick (§7.8): an olive-oil brand that picks Deepen and Borrow a crowd walks Crowd → Where → Places → Partners; an online skincare brand that picks Online and New crowd walks Crowd → Online → Message. Same engine, same screen.

**v4.0: Qloo as a measuring instrument.** Most taste apps make one Qloo call per question and hand the list to an LLM. Athena runs about 100 controlled probes per brand, each asking Qloo to rank a fixed set of about 150 entities under one signal, and analyses the answers as a matrix with standard, citable methods (§9.23): crowds with bootstrap confidence, checked against shuffled data, and what each crowd loves beyond its fame. An LLM can't produce this matrix, because it needs Qloo's panel data. The founder sees it as the **Taste Galaxy** (§13.11). The **Taste Bench** (§10.6) measures, under a pre-registered rule and against real stockists, how much more Athena gets out of Qloo than a raw call, and publishes how Gemini alone does on the same questions.

**Why only Qloo.** An LLM can name popular cafés, big cities and famous brands. It cannot:

1. measure which venues' crowds match a brand's twelve best accounts;
2. carry that match into a city where it has never seen the brand;
3. rank cities by how much of the crowd's taste they hold;
4. score a partnership from both sides: how much their crowd likes you, and how much yours likes them;
5. name the shows, films, artists, podcasts and festivals this specific crowd over-indexes on;
6. re-rank from what a brand wins and loses;
7. split a brand's customers into distinct crowds from real cross-domain affinities, and say where each one lives and what it loves. An LLM can only guess at personas; here each crowd is a cluster of real Qloo entities, placed by about 100 Qloo probes, and only the members that hold up better than shuffled data are claimed (§9.23).

Athena does all seven. On Places, the judge can flip **Without Qloo** to see a chatbot answer the same question, with each of the chatbot's venues looked up in Qloo.

**What else Athena uses, and why.** Free public sources and Google Cloud services fill only the gaps the key-day spike proved Qloo doesn't cover: market size, neighbourhood names, contact details, event dates, podcast details and website reading (§11.2). They never rank anything. Every value shows its source label.

**Why it wins.** Each judging criterion has a specific answer:

- **Technological implementation:** a taste engine that uses Qloo as a measuring instrument (about 100 probes per brand, spectral crowds with bootstrap confidence and a shuffled-data check, popularity-debiased specificity; §9.23) and a pre-registered test against Gemini alone (§10.6); cross-city signal transfer; two-call rank scoring over fixed pools; two-sided scoring (bridges and mutual fit); shared-pool positioning; Qloo-ranked moments joined to dated events; a grounding validator. They use 15 Qloo capabilities, each tested live on 8 Oct (§11.1), and every block shows how many Qloo calls built it.
- **Design:** the Taste Galaxy, which forms live and can be hovered, pinned and questioned (§13.11); a product-first conversation that never asks founders what they can't know; a step-by-step journey where every stop is a decision; crowd cards built from a real taste graph; a **Without Qloo** toggle on Places; a line on every stop saying how it was ranked; every number opens its source; a dashboard for the work after.
- **Potential impact:** a consumer founder's next growth decisions, turned into named targets they can act on tomorrow.
- **Quality of the idea:** places and partners as a taste fingerprint; lookalike places, partners and moments; two-sided partnership fit; outcomes as signal.

**Honesty.** The stockist blind test was run on the tuning brand on 8 Oct and failed (§10.1). Athena makes no accuracy claim it hasn't measured, and the Method page publishes the failed test. The Taste Bench (§10.6) is registered before any held-out brand is run and is published whatever it shows.

---

## 2. The demo (everything else serves it)

A judge who gives it two minutes leaves convinced. A judge who gives it ten finds depth wherever they click. Nothing is simulated: every brand runs the real ranking code, and every number is computed from real Qloo responses.

### 2.1 Principles

1. **Live from the first message.** No signup, no setup. The judge picks a sample-brand pack (§7.7) or brings their own brand, and watches it run live. Cached Qloo responses make repeats fast (§14.9).
2. **Real data, cached responses.** The server caches Qloo and external responses (§11, §14.9). It never caches answers: rankings, scores and labels are recomputed from those responses on every load. Two things are cached as finished results, each labelled with its date: the Without Qloo answers for the demo brands (slow and paid per run, so Re-run is capped), and the fallback in §14.2.
3. **We guide; we never drive.** The journey itself is the guide: each stop says what it's for and offers a recommended choice. The app never chooses for the judge.
4. **The evidence is a comparison the judge triggers.** The **Without Qloo** toggle on Places swaps Athena's venues for a chatbot's answer to the same question, with every chatbot venue looked up in Qloo (§10.2).
5. **Every number explains itself** in one line, and opens the call that produced it.
6. **Measured looks different from written.** Data values use tabular numerals and a source label. Agent-written text is labelled **Agent**.
7. **"Measured" appears in one place only:** the ranking check (§10.3), and only if it passes its pre-registered rule. Everything else is labelled **demonstrated**.
8. **No dead ends.** Weak results show the agent recovering, in the rail. If Qloo or the LLM is down, the brand's last live run fills in, labelled with its time.
9. **One journey, one dashboard.** Versatility comes from the founder's growth types choosing the stops, never from a screen built for one business.

### 2.2 The landing page, the way in, and the journey

**Landing page (`/`).** Says what Athena does before asking anything of the visitor:

- **Hero:** eyebrow "The taste-led growth agent for consumer startups"; headline "Grow where your customers already are."; one paragraph on what Athena reads (what customers love) and what it returns (which city next, which venues to pitch, who to partner with, what to say, when to show up); **Start planning →** (primary) and **How it works** (the Method page).
- **A quiet data line:** "Taste data from Qloo, read and written up with Gemini. Every ranking shows the calls behind it." (understated, §13.9).
- **One plan, six parts:** one card each for Read, Markets, Places, Partners, Message and Moments, one sentence each.
- **How it works:** three steps (tell Athena about your brand; watch the plan build; act on it) and a second **Start planning →**.
- **Footer** as below.

**The way in (`/start`).** "Where do you want to start?": a highlighted **Try your own brand** card, and below it **Or try a sample brand**: one card per context pack (§7.7), each saying what's in it ("deck · stockist sheet · 4 product photos"). Picking a pack opens the journey with the pack's files already attached to the first message; the judge presses send, and everything after that runs live.

**The journey (`/plan`)** (§13.1), with the conversation open. Around it:

- **Title:** "Athena: the taste-led growth agent for consumer startups"
- **Subtitle:** "Plans your growth from 1 to n: which crowd, where they are, which venues, who to partner with, what to say and when to show up."
- **Comparison line,** computed from the hero pack's Places stop and its dated Without Qloo answer: *"Same question, with and without Qloo: of the chatbot's [N] venues, [b] are closed or couldn't be verified in Qloo, and the rest rank #[r] of [P] on your crowd's taste in Qloo. Every one of Athena's [N] carries Qloo evidence."* The bracketed values are computed, never typed; the line appears only once a comparison exists. It links to the Method page. **[DECISION]** The hero pack is the one Qloo knows (§7.7).
- **Footer:** Method · Sources · What we don't know · GitHub · "Sample brands are built from public info and not affiliated with us." · data attributions (§15).

**Removed in v3.0:** the real-brand demo workspaces (`/<brand>` for Brightland, Timeleft and Master & Dynamic), the brand switcher, and the "Try this" card.

### 2.3 Key moments

| # | Moment | What the founder or judge does | What happens | Why it wins |
|---|---|---|---|---|
| J1 | **Tell me about your product** | Describes the product, drops in a deck or photos, or picks a sample-brand pack | Athena reads it all, asks at most one question at a time, and fills a live "What I understood" card; every field shows its source | It asks what founders know, never what they don't |
| J2 | **Online or offline, and how to grow** | Confirms Athena's guess (one tap), picks up to 3 growth types | The options reorder for the channel; Athena pre-selects 1–2 with a reason | The founder states the goal; Athena does the rest |
| J3 | **Your crowds** | Reads 2–3 crowd cards, answers "That's us", "Not us" or "Partly", picks one | Each card: a name from its Qloo entities and tags, what it loves across brands, music, TV and places, its labelled audience skew, where it concentrates | The part no LLM can do: real crowds from a real taste graph |
| J4 | **Where** | Picks a city, or asks "what if Austin?" | Cities ranked for that crowd; the map flies to the pick; heatmap and named neighbourhoods | Only Qloo can rank cities by a crowd's taste |
| J5 | **Places, Partners, Online, Message, Moments** | At each stop: shortlists, filters, asks for "more like this" | Each stop streams in, ranked for the chosen crowd and city, every pick with evidence and "Show me why" | Every pick carries evidence |
| J6 | **Without Qloo** | Flips the toggle on Places | The chatbot's venues replace Athena's; each is marked *found*, *closed* or *unverified*, and the comparison line updates (§10.2) | The challenge's comparison, on the judge's own click |
| J7 | **Go → the dashboard** | Reviews the plan, drafts outreach, marks wins and declines | The dashboard opens with everything chosen; re-rank runs on outcomes with a reason | A complete job and a loop that learns |

**Mapping from the v2 moments.** Other sections still cite M1–M10; read them as: M1 → J1–J2 (the read card fills in during Chapter 1); M2 → J4; M3 → J6; M4 → "Show me why" at any stop; M5, M6, M7 → the Partners, Message and Moments stops (J5); M8 → J7; M9 → different growth types giving different journeys (J2); M10 → J1–J3.

### 2.4 The "Try this" card

Removed in v3.0. A first-time judge is guided by the journey itself and by the sample-brand packs (§2.2). Where other sections say "the Try this path", read: **the sample-pack path**, meaning `/start` → a sample brand → send → walk the journey to Go.

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
| G3 | Judges reach the comparison fast | ≤ 90 s from arriving, through a sample-brand pack |
| G4 | Versatility that holds up | Three recipes demoed with strong output; 5 categories tuned and passing the QA checklist (§16) |
| G5 | Real-world evidence | ≥ 5 founder calls across goods, tech and apps, quoted; ≥ 1 real brand runs Athena on its own data before 26 Oct |
| G6 | Nothing breaks | Zero errors on the sample-pack path in 5 fresh-browser rehearsals; live and free through 17 Nov |
| G7 | Ship early | Submitted on 28 Oct |
| G8 | Zero spend outside the credit | All Google Cloud usage stays inside the $300 Free Trial credit; no card is ever charged; every external API is on a free tier (§14.8) |
| G9 | A measured answer to "what does Qloo add?" | The Taste Bench (§10.6): Athena vs a raw Qloo call and popularity as the primary tests, Gemini alone as a published secondary; registered in `prereg-v2` by 16 Oct, run on 8 held-out brands by 19 Oct, published whatever it shows |

### 3.2 Non-goals

- Running ads or buying media. Athena suggests ad interests and audiences **to test** (§9.24); the founder runs the ads.
- Any private individual as a target. Creators are approached as partners in their professional role, like podcasts (§9.24); no consumer is ever named, profiled or targeted.
- Inferring anything about an individual. Aggregate audience skew is shown only under the rules in §9.17: never used to rank or filter, and offered for ads only as something to test.
- Sending messages or contacting anyone. Athena drafts; people send.
- Alcohol brands, and utility apps that don't grow through places or partners.
- Custom outputs for particular categories: PDF packs, site briefs, launch documents.
- Markets outside the US.
- Replacing a CRM.
- Selling tickets or replicating a ticketing experience. Moments links out to the source for tickets.

### 3.3 Judging map

| Criterion | What we show | Where |
|---|---|---|
| Technological implementation | The taste engine (§9.23): about 100 Qloo probes per brand analysed as a matrix, spectral crowds with bootstrap confidence and a shuffled-data check, specificity; the Taste Bench (§10.6): Athena against a raw Qloo call, popularity and Gemini alone; the methods in §1; 15 Qloo capabilities, each tested live (§11.1), with per-block Qloo call counts; gap-filling sources joined to Qloo results, each labelled (§11.2); tests for every method | M2–M9, Method page, trace, repo |
| Design | The Taste Galaxy (§13.11); a product-first conversation; a step-by-step journey where every stop is a decision; crowd cards from a real taste graph; a dashboard for the work after; a Without Qloo toggle on Places; every stop says how it was ranked; every number clickable; the 5-second test passed; a phone layout | §2, §13 |
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
| Metro, neighbourhood | Any US metro area (Census CBSA; about 390), and an Overture neighbourhood polygon inside it. The 25 largest are a fixed list used only for the ranking check and the With/Without Qloo proof (§9.3). |
| Live run | A run that calls Qloo and the LLM now (through the response cache). |
| Warm cache | Qloo responses for the demo brands, refreshed daily by a scheduled job so demo blocks load in seconds (§14.9). |
| Fallback | A brand's last live run, shown with its time when Qloo or the LLM is down or a cap is reached (§14.2). |
| Fixture | Synthetic data shaped like Qloo's, labelled FIXTURE, for building and testing without keys. |

---

## 6. Flows

### 6.1 Core loop

**Product → Channel and growth types → Crowd → (stops chosen by the growth types) → Go → Dashboard: Act → Record → Re-rank.** Every stop waits for the founder's choice. Every choice carries forward. Every step shows its reasoning. No outbound action happens without the founder. Every outcome changes the ranking.

### 6.2 Try your own brand

#### 6.2.1 Chapter 1: your product

1. **The conversation.** Athena opens: *"Tell me about your product. Even just the name works. Drop in anything you have: a deck, photos, a stockist list, your website."* Text is required; attachments are optional.
   - **Attachments:** drag-and-drop, paste (including pasted screenshots) or a file picker. Accepted: images (PNG, JPEG, WebP), PDF, plain text, CSV, Excel (.xlsx), PowerPoint (.pptx), Word (.docx). URLs typed in the text are picked up as websites (§9.20).
   - Each attachment shows as a chip with a status line ("Reading 4 slides…", "Found 38 stockists") and can be removed.
   - Every input becomes one **brand brief** (§9.22), shown as a live "What I understood" card, each field labelled with where it came from.
2. **What Athena asks about: the product.** One question at a time, only for what it couldn't find in the files, the website or web research (which runs in the background and never blocks a reply):
   - what it is and what makes it different;
   - price point;
   - what it's made of (ingredients, materials) and how it looks and feels (design, packaging);
   - when and why people use it (the occasion);
   - where it's sold today.

   Athena **never** asks the founder about their customers' tastes (what they listen to, which brands they love). Working that out is Athena's job (§9.23).
3. **"Is this you?"** When Qloo returns more than one plausible brand, Athena asks once (Yes / No / Skip).
4. **Online or offline.** Pre-selected only when the founder said it or a cited source shows it (a shop page → online; a stockists page → offline; v3.1: never a blind guess), labelled "you said" or "from the web"; otherwise Athena asks. One tap: **Mostly online · Mostly offline · Both**.
5. **Growth types** (§7.8): up to 3, shown as cards ordered for the channel, with 1–2 pre-selected by Athena and a one-line reason each.
6. **Required before the journey moves on** (a fixed checklist in code, not the LLM):

   | Required | Why |
   |---|---|
   | Brand name | Qloo lookup, drafts |
   | What it sells, with enough product detail to read into Qloo (§9.23 step 1) | The taste signal |
   | Online, offline or both | Which growth types are suggested, and what a city means |
   | 1–3 growth types | Which stops the journey has |

   **City is no longer required.** It's asked at the Where stop, and only when a chosen growth type needs it (§7.8).
7. **Changed in v3.1:** each question has a **"Not sure, look it up for me"** reply: Athena researches the answer (labelled **Web**, editable) and asks again only if research finds nothing. Facts are never filled from the model's guesses. At most 4 follow-up turns; a question is never asked twice (the agent is given the questions already asked, and a code check refuses a rephrased repeat); out-of-scope businesses (§4.3) get the one-line reason.
8. **The taste graph starts as soon as the product is clear** (§14.9), while the founder answers the channel and growth questions.

#### 6.2.2 Chapters 2 onward: the journey

1. **Step by step** (decided 10 Oct): each stop waits for the founder's choice before the next one starts.
2. **Stops are chosen by the growth types** (§7.8). Shared stops appear once; the first growth type leads.
3. **Each stop is a decision, not a block to read:** it opens with Athena's streamed one-paragraph take, a recommended choice, and options to explore (§13.2).
4. **Choices carry forward.** Changing an earlier stop re-ranks the later ones it affects, with a one-line "what moved and why" note. **[DECISION]** Stops already visited re-run automatically; nothing the founder shortlisted is dropped without saying so.
5. **Talk to it anywhere** (F31): "drop gyms", "where after Chicago?" becomes a change to the right stop, shown in the activity trail.
6. **The v2.13 inline questions are removed.** Their jobs move into stops: "Is this you?" into Chapter 1; "Where are you sold? Paste anything." into the Places stop for Deepen; "Swap any comparable brands?" into the Crowd stop.
7. **Go** ends the journey and opens the dashboard (§13.2).
8. **Kept:** Without Qloo on Places, capped (§14.5); the trace; the pipeline and the brief kept for 7 days in an anonymous session, so a returning founder lands on the dashboard.

### 6.3 Signal by stage

The full table is in §7.5. In short:

- **No accounts:** the brand and comparable brands.
- **1–9 accounts:** accounts plus brands.
- **10 or more accounts:** accounts only, plus wins.
- **Product only** (no brand in Qloo, no accounts): product tags plus lookalike brands, each found in Qloo (§9.23 step 1).

From the Crowd stop on, **the chosen crowd's weighted entities are the signal** for every later stop (§9.23 step 7), with accounts still driving Places when the brand has them.

This stage signal drives **Places** and the **Read card**. When the brand is in Qloo, **Markets, Partners, Message and Moments** use the brand entity plus comparables until the founder picks a crowd (§7.5); from the Crowd stop on, the crowd's weighted entities replace them.

---

## 7. Internal playbooks (never shown as a menu; the founder sees Plays, §13.13)

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

**Build rule:** anything that can't be expressed through the six blocks doesn't get built. (v3.0 adds one stop, Online, §9.24.)

**v3.0:** the founder never sees motions. They pick **growth types** (§7.8), and each growth type maps onto motions here. The crowd chosen at the Crowd stop (§9.23) replaces the brand-plus-comparables signal for every later stop.

```ts
type Motion = "venue" | "retail" | "city_launch" | "partnership" | "location_opening" | "online";
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
  targetMetro: MetroId;                  // any US metro (CBSA), from the crowd or typed by the founder (§9.3)
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
| R5 Online (v3.0) | online | Crowd → Online (§9.24) → Message → Partners (creators, podcasts, collab brands) → Moments → Act | Collab inquiry; creator inquiry; sponsorship inquiry | Target → Contacted → In talks → Live → Renewed, or Declined |

**Evidence for every recipe:** demonstrated, through Without Qloo on Places (§10.2). R1's Places also shows the ranking check if it passes (§10.3).

**Several motions:** blocks merge in motion order, and each block appears once. The first motion's lead block opens first. Example: T1 has motions partnership and retail, so its blocks run Partners → Message → Moments → Markets → Places → Act.

### 7.7 Demo brands → context packs

Decided 10 Oct: demos are **context packs**, not precomputed plans. The packs themselves are prepared as separate work.

- **Three packs** (decided 10 Oct):
  1. **The hero: Brightland** (olive oil), a real brand Qloo knows, built only from public material: its real website, its public store locator ([brightland.co/pages/store-locator](https://brightland.co/pages/store-locator), independent stockists), and a one-paragraph description in our own words. No deck, no internal documents, nothing invented about a real company. Labelled "Built from public info; not affiliated with Brightland." It shows the offline path best (Deepen, Places with indie stockists) and has strong creators (Alison Roman, Julia Turshen, Yossy Arefi; 7 of 15 passed §9.24's rules on 10 Oct). §2.2's comparison line uses it.
  2. **Starface** (pimple patches), a real online-first brand Qloo knows, built the same way and labelled the same way. It shows the online path best (Online, New crowd, Borrow a crowd): a distinct Gen Z crowd (Studs, Versed, CUUP, Set Active) and real TikTok creators (Melissa Ong, Mad Tsai, Tatyanna Mitch; 7 of 15 passed). Its store locator ([starface.world/pages/where-to-shop](https://starface.world/pages/where-to-shop)) lists only national chains (Walmart, Target, CVS, Ulta…), so its Places stop is thin by design; the pack's description says it sells mostly online.
  3. **Fishwife** (tinned fish), a young real brand **Qloo doesn't know** (10 Oct: no match), built the same way and labelled the same way. It runs on product tags and lookalike brands (§9.23), the path most young founders will hit. Its public store locator ([eatfishwife.com/pages/store-locator](https://eatfishwife.com/pages/store-locator), via Stockist) had 5,044 stockists in the 25 largest metros on 8 Oct, **1,516 of them independent** (NYC 223, LA 218, SF Bay 156), alongside chains such as Kroger, Whole Foods, Target, Costco and Wegmans. So it shows both Places from real indie stockists and the **retail step-up** (§9.25): the high-fit retailers it isn't in yet. It's no longer a ranking-check test brand (§10.3).
- **Nothing fictional** (decided 10 Oct): every pack is a real brand, built only from public material (its website, its public store locator, and a description in our own words). No decks or internal documents are ever made up for a real company.
- **Disclaimers:** each pack says "Built from public info; not affiliated with [brand]."
- **It runs live.** Qloo responses are cached as a speed-up only (§14.9), never as finished answers.
- The v2 demo brands (Brightland, Timeleft, Master & Dynamic) stay in tests and the ranking check; they're no longer demo workspaces.

### 7.8 Growth types (the founder's choice)

The founder picks **up to 3** growth types. Motions (§7.1) stay inside the code: each growth type maps onto motions and blocks.

| Growth type | The founder's question | Who it targets | Stops it adds | Internal motions | Suggested for |
|---|---|---|---|---|---|
| **Deepen** (shown as "Get into stores" for online brands) | "Get into more places in my city, and into bigger retailers" | Current crowd | Where (home city), Places (stockists), Next retailers (§9.25) | venue, retail | Offline ⭐ |
| **New city** | "Where should I expand next?" | Current crowd | Where (ranked cities), Places (event or launch venues) | city_launch | Offline ⭐ |
| **New crowd** | "Who else would love this?" | An adjacent crowd (§9.23) | Crowd (pick the adjacent one), Message | partnership, plus the crowd's own blocks | All |
| **Borrow a crowd** | "Who should I collab with?" | A partner's crowd | Partners | partnership | Online ⭐ |
| **Show up** | "Which events and moments?" | Current or new crowd | Moments | (blocks only) | All |
| **Online** | "Who do I target online, and with what?" | Current or new crowd | Online (§9.24), Message | online | Online ⭐ |
| **Own location** (Beta) | "Where do I open a store?" | Current crowd | Where (cities, then neighbourhoods), Places (complementary neighbours) | location_opening | — |

**Rules:**
- **The channel answer orders the cards and sets the ⭐ suggestions. Nothing is hidden:** an online brand can pick "Get into stores".
- **For online brands, a city means where to focus ads and pop-ups**, and Places shows pop-up and event venues, not stockists.
- **Prerequisites** grey an option out, with the reason: Deepen needs a home presence (stockists or a home city); Own location needs a physical product or service.
- **Combinations that need one decision:** Deepen + New city → "Which city comes first?" (the plan covers both); New crowd + another type → for each other type, the current crowd or the new one ("Collab to reach the new crowd"). **Built (v3.2):** one question at the Crowd stop for all the other picks, answered before the journey moves on. "New": every stop follows the new crowd. "Current": stops only New crowd asked for follow the new crowd; every other stop follows the crowd marked "That's us", or else the main one. With New crowd picked, "That's us" marks today's customers and doesn't move the plan off the new crowd.
- **More than 3:** Athena says in plain words that the plan would spread too thin for a young brand; it doesn't block.
- **The founder can change growth types at any time;** the journey re-routes and keeps decisions already made.

---

## 8. Functional requirements

P0 is the demo path. Every requirement has a test.

| ID | Requirement | Moment | P | Done when |
|---|---|---|---|---|
| F1 | A landing page (`/`) with the hero, the six parts and **Start planning**, leading to `/start` (Try your own brand, or a sample-brand pack, §2.2). The journey (`/plan`) has the title, subtitle, the computed comparison line and a footer with the disclaimer and data attributions | Landing | P0 | The landing page and `/start` render without any API call; a sample pack's first streamed reply starts ≤ 3 s after send |
| F2 | **Removed in v3.0** (the "Try this" card; the journey and the sample-brand packs replace it, §2.4) | — | — | — |
| F3 | Product-first conversation (§6.2.1): text plus optional attachments (images, PDF, TXT, CSV, XLSX, PPTX, DOCX, URLs) turned into one brand brief (§9.22); questions only about the product, one at a time, never repeated; "Is this you?"; the four required facts (name, product detail, channel, growth types) | J1 | P0 | A product described in one sentence plus ≤ 2 answers reaches the growth-type step; a 20-row store-list screenshot yields ≥ 16 correct stockists; a 40-row XLSX yields ≥ 38; a pack's deck yields the right category and tier for ≥ 8 of 10 test packs; across 20 test conversations Athena never asks about customers' tastes and never asks a question twice; the checklist test proves the journey can't move on with a required fact empty unless it's labelled guessed |
| F4 | Resolution of venues and brands, with ambiguity chips (§9.1) | M1, M10 | P0 | ≥ 95% precision on a hand-labelled set of 40 venues and 20 brands (venue precision measured on 8 Oct: 24 of 25 certain, 1 likely); ambiguous matches are never picked automatically |
| F5 | The "How I read your business" card, filled live during Chapter 1: what you sell and the tier, channel, growth types, taste signal, competitors, stage, a Tuned or Beta badge; *Looks right* and *Edit*; evidence overrides the LLM; out-of-scope businesses get a reason | J1, J2 | P0 | Every line shows evidence; an edit re-runs the stops that depend on it; 10 test businesses across goods, tech and apps get the expected growth-type suggestions |
| F6 | Growth types → stops through one `PlaybookConfig` (§7.8, §7.6); the journey's stops follow the picks | J2, J5 | P0 | Three different growth-type picks give three different journeys, with no screen built for one pick |
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
| F26 | Phone layout and a list view of the map | All | P0 | The sample-pack path completes on a 390 px wide screen |
| F27 | Ranking check (§10.3), pre-registered | Depth | P0 | Registered before any test-brand call; published whatever the result; "Ranking check: measured" appears only if it passes |
| F28 | Mood board: 4 Imagen images from the Message block (§9.21) | M6 | P1 | 4 images in ≤ 20 s; the label "AI-generated mood board" is shown; the daily image cap holds |
| F29 | Remote MCP server on Cloud Run exposing `find_markets`, `find_places`, `find_partners`, `build_message` and `find_moments` (§12.9) | — | P1 | An MCP client (e.g. Gemini CLI or Claude Desktop) gets a valid block back; the same caps apply |
| F30 | Score a list (for brokers) | — | P1 | A pasted list comes back ranked, with reasons |
| F31 | Talk to it at any stop ("drop gyms", "brunch spots only", "where after Chicago?") | J5 | P0 | The request becomes a change to the right stop, shown in the activity trail |
| F32 | Tune the Beta recipes and categories (R4 locations, more of G4–G8, T2–T3, A2–A3) | — | P1 | Each one passes the QA checklist (§16) |
| F33 | More bridge types: podcasts, artists, TV shows | M8 | P1 | Shown as shared loves only, never as people to contact |
| F34 | "Next kind of account" card | — | P1 | Names the strongest venue type the brand isn't in yet |
| F35 | Home-city gaps | — | P1 | Names up to 3 neighbourhoods with strong taste and no accounts |
| F36 | Wins-vs-declines tag analysis from two `urn:tag` calls | M8 | P1 | Explanations cite the tag difference |
| F37 | Tier override as a scripted beat | — | P2 | Changing the tier on the card visibly changes the picks |
| F38 | Category seasonality per metro from the Google Trends API, only if the alpha application is approved | M7 | P2 | A seasonality line with its source appears for the target metro |
| F39 | One-page growth brief (print stylesheet) | — | P2 | Prints on one page from the browser |
| F40 | **Online or offline**, with Athena's guess and a one-tap confirm (§6.2.1) | J2 | P0 | The guess is right for ≥ 8 of 10 test brands with websites |
| F41 | **Growth types:** up to 3, prerequisites, conflict questions, channel-based ordering (§7.8) | J2 | P0 | Each rule in §7.8 has a unit test |
| F42 | **Taste graph and crowds** (§9.23) | J3 | P0 | Liquid Death and one product-only brand each give 2–3 crowds whose top 10 entities overlap ≤ 30% between any two; every crowd name uses only words from its Qloo entities and tags (validator); the graph uses ≤ 40 Qloo calls; a "That's us" re-weights the next stop's results |
| F43 | **The journey** (§13.1–13.2): step by step, a progress rail, back and forward, choices carried forward with a "what moved" note | J3–J7 | P0 | Changing the crowd re-ranks every later stop; no stop starts before the founder chooses |
| F44 | **The dashboard** (§13.2): the whole plan on one screen, sharing state with the journey; the pipeline is worked here | J7 | P0 | A change in either view shows in the other; a returning founder lands on it |
| F45 | **Online stop** (§9.24): creators, podcasts, ad interests and audiences to test, content angles | J5 | P0 | An online test brand gets ≥ 5 creators or podcasts and ≥ 3 ad-interest suggestions, each with evidence and the aggregate label; a code test proves no blocked audience type (§9.17) can appear |
| F46 | **Qloo pacer** (§14.9): never more than the key's per-second limit, priority to what the founder sees first | All | P0 | A 40-call burst returns no 429s; each stop's first results land ≤ 2 s after the founder's choice when the cache is cold |
| F47 | **Next retailers** (§9.25): retailers ranked by crowd fit, minus those the brand is already in, with shared loves and a buyer-pitch draft | J5 | P0 | Fishwife's pack lists ≥ 3 high-fit retailers not on its store locator; every retailer passes the match check; own-label retailers are flagged |

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

- **The brands method (v4.1, built 13 Oct; used whenever there are ≥ 5 brands).** The brands are the brand itself when Qloo has it, plus the main crowd's brand members (§9.23), strongest first, at most 50. Each of the 25 named metros except home gets one call: `GET /v2/insights?filter.type=urn:entity:brand&signal.location.query=<metro>&filter.results.entities=<the brands>&take=<their number>`, all in parallel. Qloo returns each brand's affinity in that metro.
- **Ranking:** a metro's score is the mean `query.affinity` of the brands Qloo returns there; a metro where it returns none comes last. Every metro is scored on the same brands, so the comparison is valid.
- **Reason line:** "Over-indexes on A, B and C": the brands that score furthest above their own average in that metro, measured in each brand's standard deviations across the metros (above 0.5, at most 3). A raw lift put the same high-variance brands on every city; the standardised one varies city by city (checked in the app, 13 Oct). Without any such brand: "Scored on n of your crowd's brands".
- **Why (tuning brands, 13 Oct):** against independent stockists per million residents (the Bench's T1 truth, §10.6), the brands method gave Spearman 0.73 (Brightland) and 0.62 (Fishwife), where the v3.0 venues method gave 0.21 and 0.40. The crowd's brands tracked stockists better than its artists, films, TV, podcasts or books on both brands. A mass-market control crowd ran the other way (−0.28 and −0.32), so the score reads the crowd's taste, not city size.
- **The venues method (v3.0, the fallback with fewer than 5 brands):** one call, `filter.type=urn:entity:place`, the signal, `filter.tags=<placeChannels>` (union), `diversify.by=properties.geocode.metro`, `diversify.take=2`, `filter.geocode.country_code=US`, `take=50`, `filter.exclude.location.query=<home metro>`, plus the tier parameters. Qloo returns metro groups ranked by their best venue; the reason line names each metro's strongest match. Here **any US metro can be shown**: Qloo labels every place with its metro (`properties.geocode.metro`), which Athena maps to a Census CBSA.
- **Coverage (v4.1):** the brands method ranks the 25 named metros only, because each metro costs one call. So a Boulder or an Asheville can't surface on its own any more; v3.0 opened the list for exactly that, and v4.1 trades it for a ranking that tracks real stockists. The founder can still type any US place (below), and the fallback still shows any metro. P1: score unnamed metros with a point and radius (`signal.location`) [VERIFY].
- **Metro ids (v3.1):** a metro outside the 25 gets a self-describing id (name plus centre), so any step can rebuild it without stored state; Census rows are matched by CBSA name. A typed city outside the 25 gets its centre from one Qloo lookup.
- **Typed locations (built 10 Oct):** the founder can type **any form of US location**: a state ("Ohio", "OH"), county ("Cook County, IL"), city ("Austin TX"), neighbourhood ("Williamsburg, Brooklyn"), zip code ("11211") or an informal region ("Bay Area", "Pacific Northwest", "the Midwest", "near UCLA").
  - **Why not Qloo's text lookup:** tested live on 10 Oct, `filter.location.query` sent "Bay Area" to Hong Kong, "Pacific Northwest" to Vietnam, "Northern California" to Northern Ireland, "Orange County" to Orlando and "near UCLA" to Chicago, and rejected zip codes. It does accept WKT polygons and multipolygons for heatmaps, venues and festivals, so Athena resolves the place itself and sends its **area**.
  - **Data:** every US state, county, city/town and neighbourhood from Overture (with population, Wikidata link, box) and every zip code from Census ZCTAs, extracted once from BigQuery public data (`jobs/`, under 2 GB scanned) into `data/places.json`; simplified state and county outlines in `data/outlines.json`, so a state is searched by its shape, not a box that leaks over its border.
  - **Ambiguity is asked, never guessed:** a name that fits several real places of similar size gets one question with options ("Which Portland? Portland, OR · Portland, ME"); the rule is any match at least 5% the size of the biggest, and at least 10,000 people.
  - **Informal places** are read by Gemini Flash-Lite into named states, counties or neighbourhoods, and **only places found in the data are kept**; two requests race because Vertex's latency tail passed 20 s. If nothing can be placed, Athena asks which city, county, state or zip was meant.
  - **Names on the heatmap follow the area:** a city or zip names neighbourhoods; a state or region names its cities (50k+ people first, smaller towns only where there aren't five such cities). Long areas go to Qloo as POST. *Verified live 10 Oct:* Ohio → Cleveland, Columbus, Cincinnati, Toledo; NorCal (46 counties) → San Francisco, San Mateo, San Rafael; 11211 → Williamsburg, Greenpoint; Pacific Northwest → Portland, Seattle, Bellevue.
- **Typed cities (v3.0):** wherever the founder types a city (Deepen's home city, "what if Boise?" at the Where stop), it resolves to its Census metro; if Qloo returns fewer than 3 matching venues there, Athena says so and offers the nearest metro that has them.
- **Per recipe:** for R2 the list is the launch order, for R3 it picks the activation or pop-up city, and for R4 it's the shortlist.
- **Verified 13 Oct** in the app (Brightland sample pack): "Built from 26 Qloo calls", a different "Over-indexes on …" line per city, no console errors. (8 Oct, venues method: 14 metros returned for the tuning brand.)
- **Market size:** each metro row adds a Census line (§9.19): population and median household income, labelled "Census, ACS 2020–2024". Census values never change the order.

### 9.4 Heatmap and neighbourhoods

- **Map layer:** `filter.type=urn:heatmap&filter.location.query=<metro>&signal.interests.entities=<signal>` returns geohash cells, each decoded to a rectangle.
  - **Colour = `affinity_rank`**, which shows where this crowd's taste is stronger than elsewhere [VERIFY its direction].
  - **Opacity = `popularity`.**
  - Legend: "Brighter means more of your crowd's taste than elsewhere."
- **Neighbourhood names (Overture, §9.19):** Qloo's `output.heatmap.boundary=urn:entity:locality` returned HTTP 500 on 8 Oct, so names come from Overture neighbourhood polygons. Each geohash cell's centre is assigned to the polygon that contains it. A neighbourhood's score is the mean `affinity_rank` of its cells, counting only neighbourhoods with ≥ 3 cells. The top 5 are listed as "Logan Square · 7 cells" (*illustrative*), labelled "Taste: Qloo · Names: Overture". If the metro has no Overture neighbourhoods, the list says "Neighbourhood names unavailable".
  - **Built (10 Oct):** Qloo's locality boundary still returns HTTP 500 (rechecked 10 Oct, LA and Chicago). Overture's neighbourhood **points** (not polygons) for the whole US were extracted once from BigQuery (27 MB scanned; polygons would scan 9 GB per metro) into `data/overture-neighbourhoods.json` (57,761 points), so lookups are local and instant for **any metro**. Each cell joins the nearest point within 2.5 km; Wikidata-linked names come first, unlinked ones only fill gaps, and housing complexes ("…Apartments") are dropped. Scores are shrunk toward the metro mean by 5 cells, so 3 lucky cells don't top 18 strong ones. *Verified live:* Chicago → Magnificent Mile, River North, Streeterville; LA → Beverly Grove, Hancock Park; Austin → Rock Rose, Downtown, Travis Heights.
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

**Who listens (top 3 podcasts, v3.1; was 5), based on Qloo Insights**

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
- **Sensitive themes (v3.1):** themes Qloo returns are filtered before display; anything touching identity, health, politics, religion or historical atrocities is dropped (Qloo returned "Slavery" for Starface on 10 Oct).

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
- **Fixed label text, always shown:** "Aggregate taste-panel signal from Qloo, relative to average. It describes people who share this taste, not your customers. Treat it as something to test, not a fact."
- **Hidden when weak:** if every value is between −0.10 and 0.10, the chart is replaced by "No clear skew".
- **Where it's shown (v3.0):** on crowd cards (§9.23), in Message, and in the Online stop, where a clear skew may be offered as an ad audience **to test** (§9.24).
- **Never used for:** ranking, filtering, recipe choice or draft text. Hooks (§9.15) can't cite it. A code test checks that no Qloo request parameter is ever built from these values.

**Audience interests** (Qloo, Q20)
- **Request:** `GET /v2/insights?filter.type=urn:audience&signal.interests.entities=<signal>&take=50`. Each result has `name`, `entity_id`, `disambiguation` and `query.affinity`.
- **Allow-list (a code constant with a test):** keep a result only if its audience type, looked up from `/v2/audiences?filter.audience.types=<type>` (cached forever), is one of `urn:audience:hobbies_and_interests`, `urn:audience:leisure`, `urn:audience:spending_habits` or `urn:audience:professional_area`.
- **Never shown or stored:** `urn:audience:communities`, `urn:audience:political_preferences`, `urn:audience:lifestyle_preferences_beliefs`, `urn:audience:global_issues`, `urn:audience:life_stage` and `urn:audience:investing_interests`. On 8 Oct, Brightland's unfiltered top 10 included Latino, LGBTQ, Spirituality and Politically Progressive; all of them are removed by this rule.
- **Display:** the top 6 allowed audiences as chips, in affinity order, under the heading "Interests your crowd over-indexes on", with the same fixed label text as the skew chart.
- **Hidden when thin:** fewer than 3 allowed audiences shows nothing.
- **Allowed uses:** a hook or content idea may cite an interest ("for people who love cooking…"), checked by the validator (§9.10).
- **Ad interests (v3.0):** the Online stop may suggest allowed interests as ad interests to test (§9.24), with the same label.
- **Never used for:** ranking, filtering or recipe choice. A code test checks that no Qloo request parameter is ever built from an audience. (On 8 Oct, `signal.demographics.audiences` changed 0 of the top 20 venues, so it wouldn't help ranking anyway.)
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
- **Call:** Gemini 3.8 Flash on Vertex with the **URL context** tool and these URLs. **Athena's own server never fetches the pages.** *(Replaced in v5 by our own safe same-domain crawl, §23.1 problem 3 C.)*
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


### 9.22 Ingesting brand context

**Goal:** many messy inputs in, one typed brief out. Everything downstream (`prepareCustom`, the blocks) reads only the brief.

```ts
type Sourced<T> = { value: T; source: { kind: "message" | "file" | "website" | "agent_guess"; ref?: string } };

type BrandBrief = {
  name?: Sourced<string>;
  sells?: Sourced<string>;                 // what it sells, ≤ 160 chars
  howBought?: Sourced<Motion[]>;           // maps to motions (§7.1)
  activeCity?: Sourced<string>;            // a US city, or "none yet"
  websites: Sourced<string>[];             // ≤ 3, checked as in §9.20
  stockists: Sourced<{ name: string; address?: string; city?: string }>[]; // ≤ 200
  comparables: Sourced<string>[];          // ≤ 5
  competitors: Sourced<string>[];          // ≤ 3
  tierHint?: Sourced<Tier>;
  stageHint?: Sourced<"prelaunch" | "early" | "scaling">;
  notes: Sourced<string>[];                // anything else useful, ≤ 10 short lines
};
```

**One route per file type**, chosen so Gemini only ever sees formats it reads natively. Vertex reads PDF, plain text and PNG/JPEG/WebP images natively, up to 15 MB per file (Vertex docs, checked 9 Oct). Office files are not native, so Athena extracts them first:

| Input | How Athena reads it | What reaches Gemini |
|---|---|---|
| Message text | As-is | Text |
| Image, pasted screenshot | Native | The image |
| PDF | Native | The PDF |
| TXT, CSV | Read as text on the server | Text; CSV keeps its header row |
| XLSX | Parsed on the server into CSV, one block per sheet, ≤ 2,000 rows a sheet | Text |
| PPTX | Unzipped on the server; slide text and speaker notes in slide order; embedded images ≥ 200 px kept (≤ 10 a deck) | Text, plus those images |
| DOCX | Unzipped on the server; paragraph and table text | Text |
| URL | Never fetched by Athena's server; read by the URL context tool (§9.20). *v5: crawled by our own safe fetcher (§23.1 problem 3 C)* | Gemini reads it |

**Two steps, so tables are never paraphrased:**

1. **Rows first, in code.** Any CSV, XLSX sheet or DOCX table that has a name-like column and an address- or city-like column is treated as a stockist list and turned into rows by column matching in code, not by the LLM. Only lists it can't match by column (screenshots, PDFs, free text) go through `parseAccounts`.
2. **Then one Gemini Flash call** with all remaining text and images returns the brief as JSON (structured output, schema above), each field with its `source.ref`. Content is data, never instructions, as in §9.20.

**Merging across turns:** each new message or file re-runs only step 1 and 2 for the new input, then merges into the brief. A field the founder typed always beats one read from a file, which always beats a guess. Conflicts ("your deck says premium, your sheet's stockists average price level 1.6") are shown, not resolved silently; evidence rules from §7.2 still apply.

**Mapping to today's code:** the brief converts to the existing `BrandInput` (`lib/agent/intake.ts`), so Phase 2 reuses `prepareCustom` with three changes: it accepts pre-parsed stockists, it emits inline questions with defaults instead of stopping on `needs_input`, and it accepts answers (confirmed brand ID, swapped comparables, added stockists) on a re-run.

**Open items:**

- **[VERIFY]** Parsing libraries for XLSX, PPTX and DOCX: pick ones that run in Node with no native binaries (for Cloud Run), and check their licences and versions before adding.
- **[VERIFY]** Gemini's per-request limit on images when a deck has many; the cap of 10 above is a guess until tested.
- **[DECISION]** Whether Phase 1's follow-ups use Flash (fast, cheap) or Pro. Default: Flash.

### 9.23 Taste graph and crowds (v3.0; engine v4.0)

**Why:** the founder knows their product; Qloo knows who loves what. This turns one into the other, and splits the result into crowds the founder can choose between.

1. **Product → seed signal.** The agent turns product traits into:
   - **Qloo tags**, chosen only from what `/v2/tags?filter.query=` returns for each trait (it never invents a tag URN);
   - **3–5 lookalike brands** (similar tier and lifestyle, not direct competitors), each found in Qloo with `/search`; only found ones are kept;
   - **the brand itself**, if Qloo knows it.

   **Built (v3.1):** tags join the seed **only when fewer than 2 lookalikes are found** (tag signals made first-ring calls 3× slower, 10–47 s); each tag must share a word with the trait and be a product tag type ("Gen Z" matched a pasta dish; place tags were rejected). First-ring calls are capped at **15 s**.

   *Verified 10 Oct:* vegan + skincare + minimalist tags as the only signal returned Cap Beauty, Organic Basics, Juice Press and Good Catch. "Clean beauty" matched only salon categories, so free phrases must go through tag search. (8 Oct found a theme tag alone too generic for **venues**, §11.1; seeds are used for brands and other entities, and venues come later from the chosen crowd.)
2. **Expand (ring 1).** From the seed, one Insights call per domain (brand, artist, TV, film, podcast, book) with `filter.popularity.max=0.99` and `take=25` gives about 150 entities; chain retailers are dropped. The seed's own order is the first column of the matrix in step 3.
   - *Verified 10 Oct:* every Insights result carries a numeric `query.affinity` (Liquid Death → Dr. Squatch 0.869; → POORSTACY 0.939), and edges cross domains (POORSTACY → Lyrical Lemonade 0.975, Golf Wang 0.967).
   - Scores within one list are tightly packed (top 8 brands: 0.849–0.869), and Qloo's docs say scores are normalised per query. So **from v4.0 only the order within each response is used.**
3. **Probes (v4.0).** A probe is one call: `filter.type=<domain>`, `signal.interests.entities=<one landmark entity>`, `filter.results.entities=<that domain's pool, ≤ 50>`, `take=<pool size>`. Each probe becomes within-probe percentiles, with unscored pool members tied below every scored one (the §10.3 rule). Every method below is therefore invariant to Qloo's per-query normalisation: in effect a rank (copula) transform.
   - **The matrix U:** one row per entity, one column per landmark (the seed, then each probed entity). Two entities' similarity is the correlation of their column-centred rows. This is the idea behind landmark MDS and Nyström features (de Silva & Tenenbaum 2004; Williams & Seeger 2001): a few reference points describe everything.
   - **Round 1:** 8 landmarks spread over every domain (each domain's strongest entity, then the 6th, 12th, 3rd and 9th).
   - **Later rounds:** 3 landmarks each, chosen by **k-center greedy** in the current similarity (Gonzalez 1985): the entity farthest from every landmark so far, so probes go where the map is least known, never at random.
   - **Stopping rule (the agent's):** stop when the crowds stop changing (adjusted Rand index ≥ 0.9 between consecutive rounds), at 16 landmarks, or at the budget of 110 calls. Below 2,000 calls left over both keys, landmarks drop to 8 (§14.9).
   - *Measured 12 Oct (Brightland):* 102 calls, 16 landmarks, about 17 s cold; cached 24 hours.
4. **Crowds with confidence (v4.0, 0 calls).**
   - **Spectral clustering** (Ng, Jordan & Weiss 2002): a k-nearest-neighbour graph (k = 8) on the similarities, its normalised affinity, the number of crowds k ∈ {2, 3, 4} from the largest eigengap, then k-means on the row-normalised eigenvectors. Louvain stays in the tests as a cross-check.
   - **Bootstrap consensus:** the landmark columns are resampled with replacement 100 times and each resample re-clustered. The co-association (the share of resamples in which two entities share a crowd) is clustered into the consensus crowds. The crowd rules carry over: ≥ 8 entities across ≥ 2 domains, otherwise merged into the nearest crowd; at most 3.
   - **Membership:** each resample's clusters are matched to the consensus crowds (the best permutation, or many-to-one where crowds were merged). An entity's **certainty** is the share of resamples that keep it in its crowd. A crowd's **stability** is Hennig's (2007) mean Jaccard with its best match across resamples.
   - **Core and fringe.** The same pipeline runs on shuffled data: every probe column permuted within each domain (the same marginals, no shared taste), 50 resamples. An entity is in its crowd's **core** only if its certainty beats the 95th percentile of certainty on shuffled data; the rest is its **fringe**. Crowd cards, signals and the Galaxy claim only cores.
   - *Measured 12 Oct (Brightland, offline on cached matrices, 0 calls).* With Great Jones and Our Place as lookalikes, λ₂–λ₄ were 0.84 / 0.83 / 0.76 against 0.75 / 0.73 / 0.69 on shuffled data, and a crowd was recovered (Jaccard ≥ 0.5) in 31–39% of resamples against 3–16%: **real but soft crowds**, hence the core rule. With Our Place and Caraway the two crowds were strong: mean Jaccard 0.66 against 0.40, recovered in 85–88% of resamples against 20%, λ₂ 0.89 against 0.75; 86 of 150 entities were core. Tried and rejected: 80% subsamples (inflate real and shuffled data alike), rank-4 denoising (makes shuffled data look structured), a kNN of 12 (no gain).
   - **The seed shapes the map.** Lookalikes come from the brief (step 1), so two briefs of the same brand can give different crowds (12 Oct: k = 2 with Our Place and Caraway, k = 3 with Aesop and Great Jones). For a fixed seed the engine is deterministic, because its random draws are seeded from the signal. The Bench registers each brand's seed (§10.6).
5. **Each crowd gets:**
   - a **name** written by the agent from only its entities and tags (validator: every word maps to an entity or tag; otherwise "Crowd A");
   - its **top loves** across domains, core members first, with affinity;
   - its **audience skew** from `urn:demographics` with the crowd's top entities as the signal, under §9.17. *Verified 10 Oct:* crowds of the same brand get distinct skews (Liquid Death's emo-rap crowd ≤ 34 and gender-neutral, its Dr. Squatch–Slim Jim crowd male +0.69), while the brand alone gives a blend of them (45–54, male +0.43), which is itself an argument for crowds;
   - **where it concentrates:** metros by the place-diversify method (§9.3), any US metro.
6. **Main and adjacent.** The crowd closest to the seed is the **main crowd**; the others are **adjacent crowds**, which power New crowd.
7. **The founder's reaction refines it, by weighting.** The signal is sent as weighted entities (`POST /v2/insights`, `signal.interests.entities: [{id, weight}]`). "That's us" raises that crowd's weight, "Partly" leaves it, "Not us" drops it to zero and moves its entities to `filter.exclude.entities`. Starting weights **[DECISION; tune]**: That's us 3, Partly 1.5, the rest 1.
   - *Verified 10 Oct* (Liquid Death + Glossier as the signal, top 10 brands): equal weights matched the plain GET exactly (10 of 10). Liquid Death at 1.5× → 2 of 10 from its own list; 2× → 2; 3× → 5; 5× → 7; 20× → 9. **The shift is gradual**, so weights nudge a plan without flipping it.
   - **Built (v3.2):** the chosen crowd's entities weigh 3; a "Partly" crowd's top 6 join at 1.5; a "Not us" crowd never joins and its top 8 go to the exclude list; crowds without a reaction stay out, so the plan keeps its focus. With no "Partly" crowd every weight is equal, so the request is the plain GET and hits the same cache. Weights apply to every block and stop through one weighted Qloo client; blocks don't change. *Verified live 10 Oct* (Starface, Partners): the weighted POSTs returned results, and on Next retailers the order shifted gently (Target and Williams-Sonoma up a place or two), as the weight test predicted.
   - Per-entity weights need the POST body with `id` keys (`entity` keys return HTTP 400). The single-number GET form isn't used.
   - **Built (v4.0): pins.** Any entity in the Galaxy (§13.11) can be pinned "Our customers love this" (it leads the signal at weight 3) or "Not us" (dropped from the signal and excluded). The agent's question (step 9) is a pin. Pins reach every later ranking through the same weighted client.
8. **Specificity (v4.0, 0 calls).** Qloo's `popularity` is a percentile within the domain, so unlike affinity it can be compared across queries. Per domain, a least-squares line of the seed's percentile on logit(popularity); the residual is the entity's **specificity**: positive when the crowd loves it beyond its fame. It sizes the Galaxy's nodes. It cuts the "everyone loves Taylor Swift" effect, and an LLM can't fake it, because it needs the panel's measured popularity.
9. **The agent's one question (v4.0, 0 calls).** After the crowds form, the agent asks about one entity: among the familiar ones (brands, TV, music) in the top half of the seed's order, the one whose membership is most evenly split between two crowds (highest normalised entropy; uncertainty sampling). The answer is a pin (step 7).

### 9.24 Online (v3.0)

For online brands and the Online growth type. The chosen crowd is the signal.

- **Creators** (Qloo's person type, `urn:entity:person`), treated like podcasts: public people in their professional role, approached as partners, contacted only through the founder's own drafts (§15).
  - `filter.popularity.max=0.9`, so stars are left out;
  - shown only if their Qloo tags say creator: influencer, youtuber, chef, author, presenter, podcaster, model, musician, food stylist and the like (`urn:tag:genre:person:*`, `urn:tag:occupation:person:*`);
  - US-relevant only: people whose tags tie them to another country are dropped;
  - at most 5, each with its affinity and the **Qloo** label; no invented contact details, only a link out to search for the person.
  - *Verified 10 Oct:* strong for niche brands, noisy for broad ones. Brightland → Alison Roman, Julia Turshen, Molly Yeh, Samin Nosrat, Yossy Arefi; Glossier → Devon Lee Carlson (tagged Influencer), Doniella Davy (make-up artist); Liquid Death → mostly noise (an American football player, a Thai executive, Indian TV actresses). **If fewer than 3 pass the rules, the stop shows podcasts only** and says nothing about creators.
- **Podcasts:** as in §9.6.
- **Ad interests to test:** the crowd's allowed audience interests (§9.17: hobbies and interests, leisure, spending habits, professional area only), phrased as a suggestion: *"Your crowd over-indexes on cooking, hiking and indie folk. Try these as ad interests."* Always with the §9.17 label.
- **Audience to test:** when the skew is clear (any value outside ±0.10), one line: *"Qloo's taste panel leans male and 45–54 for this crowd. Worth testing as an ad audience alongside your current one."* Never phrased as a fact about the brand's customers.
- **Content angles:** references and hooks from Message (§9.15), angled for social.
- **Where to focus ads and pop-ups:** the crowd's top metros.
- **Never:** blocked audience types (§9.17), anything about an individual consumer, or any Qloo request built from audiences or skew.

### 9.25 Next retailers: the retail step-up (v3.0)

**Why:** independent stores are where young brands start, not where they stop. The question after "which cafés and shops?" is "which bigger retailer next?", and Qloo can rank retailers by how much the brand's crowd loves them.

- **Pool:** retailer brands, from two sources, merged and de-duplicated:
  1. a fixed list of US grocery, specialty-food and home retailers (about 40: Whole Foods, Erewhon, Sprouts, Eataly, Central Market, Wegmans, Williams-Sonoma, Sur La Table, Target, Walmart, Kroger, Costco…), each resolved once in Qloo with a **match check** (10 Oct: "Murray's Cheese" resolved to Philadelphia cream cheese, so a name-similarity check like §9.1's is required) and cached forever;
  2. Qloo's own picks: `urn:entity:brand` with `filter.tags=urn:tag:genre:brand:retail` under the crowd's signal, `take=15`, which surfaces smaller retailers a founder may not know.
- **Built (v3.1): pools per category.** The fixed list is split by category; Qloo's own retail-genre picks are added **only for general goods**, because its coarse genre tags put Goop and Thredup above grocers for tinned fish.
- **Ranking:** one call, `filter.results.entities=<pool ≤ 50>` under the chosen crowd's weighted signal (Q8 method), ordered by affinity.
- **Removed in code:** retailers already on the brand's store locator or in its files; retailers marked in the list as mostly own-label (Trader Joe's, Aldi) are shown last with a note ("mostly sells its own label").
- **Shown:** the top 5 with affinity, the shared loves between the retailer's crowd and the brand's (the bridge rule, §9.8), and a **buyer-pitch** draft (F19). Labelled "Ranked by how much your crowd loves each retailer (Qloo)". Never phrased as a prediction that a buyer will say yes.
- **Verified 10 Oct** (crowd from Brightland, Great Jones and Momofuku; 15 chains): Trader Joe's 0.855, Erewhon 0.852, Sur La Table 0.847, Williams-Sonoma 0.845, Eataly 0.838, Central Market 0.821 … Whole Foods 0.781 … Target 0.675, Kroger 0.672, Walmart 0.605. The retail-genre filter added The Goods Mart, New Seasons Market, H Mart, The Little Market and Verve Wine.
- **Calls:** 2 (plus cached resolution).

### 9.26 Crowd geography (v4.0, planned 17–19 Oct)

- **Heatmap:** one US-wide heatmap per crowd (`urn:heatmap`, `filter.location` = a US WKT polygon, the crowd's core as the signal). *Verified 12 Oct:* 3,789 geohash-4 cells in 2.05 s; a Texas polygon gave 419 cells in 0.73 s; Brightland's top cells were the SF Bay, Monterey and Santa Barbara. **Calls:** 1 per crowd.
- **People:** cells are joined to county population (3,121 county outlines in `data/outlines.json`; populations from one Census ACS call, `for=county:*` [VERIFY]), shared out by area overlap and precomputed once. **Taste-weighted reach** per metro is the sum over its cells of population × the cell's percentile.
- **Hotspots:** Getis-Ord **Gi\*** over each cell and its 8 geohash neighbours, with Benjamini–Hochberg control across cells. The map shows only significant clusters.
- **Crowd weather:** each cell coloured by the crowd that over-indexes there most (shape and colour per §13.4).
- **P1, own-location brands:** a Huff gravity catchment, P(cell → store) ∝ attractiveness / distance^λ, λ = 2 [tune].
- Extends Markets (§9.3); the place-diversify method stays as one input.

### 9.27 Taste axes (v4.0, planned 20–22 Oct)

- Non-negative matrix factorisation of U (Lee & Seung 1999), rank 3–5 chosen on held-out entries.
- Each axis is named by the agent from its top-loading entities and their Qloo tags only, under the validator (§9.10); otherwise "Axis 1".
- **Sliders** reweight the landmarks, w ∝ 1 + α·H (5 positions per axis), and re-rank the current stop for 1–2 calls per move through the weighted POST (§9.23 step 7). Positions are cached.

### 9.28 Bridges and why-paths (v4.0, planned 20–22 Oct)

- **Bridge score** between two signals (two crowds; or brand and partner): the harmonic mean of the entity's percentiles under each. High only if both sides love it, which tightens §9.8.
- **Why-path:** final ranking calls add `feature.explainability=true` (*verified 12 Oct* on brands: Brightland + Great Jones → Material, The Culinistas, Lake Hour, with per-signal scores). Shown as a small Sankey from the signals, through each one's contribution, to the pick and its crowd. **Calls:** 0 extra.

### 9.29 Learning from outcomes (v4.0, P1)

- When the founder marks outcomes ("store said yes", "no reply"), a Bayesian logistic model on the U embedding proposes the next venues by Thompson sampling.
- Tested by the Bench's discovery simulation (§10.6, T4).

---

## 10. Evidence and proof

Athena makes one kind of claim per block: **demonstrated** (shown with evidence and compared with a chatbot) or **measured** (checked against ground truth under a pre-registered rule). Only the ranking check (§10.3) and the Taste Bench (§10.6) can earn "measured".

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

### 10.3 Ranking check (measured, P0; pool revised 13 Oct)

It tests whether Qloo, given a brand's real stockists in one metro, ranks its real stockists in another metro above look-alike venues of the same kind and the same fame. It is the Taste Bench's task T3 (§10.6).

**Pre-registration.** Before the first call on any test brand, commit `proof/REGISTRATION.md` and tag it `prereg-v2`. It fixes everything below, plus the seeds and the code, and a commitment to publish every result. The Taste Bench (§10.6) is registered in the same file and tag.

**Test brands (fixed 13 Oct, §22):** three brands from `proof/stockists/` other than the tuning brands, one per category:
- McClure's Pickles (G1): metro A Detroit (142 independents), metro B New York (95);
- Rishi Tea (G2). MUD\WTR, the alternative, isn't used: it was a signal in development checks and an anchor brand in Athena's code (registration §11);
- Paddywax (G4).

Each must have ≥ 10 stockists kept in metro B (step 3) and a decoy for every one. That is checked after registration; a brand that falls short is reported as ineligible, never swapped silently.

**Swap on 10 Oct:** Fishwife (G1) was replaced by McClure's Pickles, because Fishwife became a sample pack (§7.7) and its stockists would run through Places repeatedly. Fishwife was never cleanly held out anyway: its NYC stockists were resolved in the 8 Oct spike (S2), and one Qloo brand-name search for "Fishwife" was made on 10 Oct (no match). No Qloo call has been made for McClure's. The registration discloses all of this.

**Procedure, per test brand** (code: `venuePool` and `t3Athena` in `lib/bench/arms.ts`; the registration gives every detail)
1. **Metros:** A and B are the two metros with the most independent stockists in the brand's file.
2. **Signal:** metro A's independent stockists in seeded order, the first 80 resolved, keeping up to 50 matched, open venues.
3. **Stockists:** metro B's independent stockists in seeded order, resolved 10 at a time. A venue is kept only if Insights can see it (a no-signal call listing it in `filter.results.entities` returns it), up to 25.
4. **Decoys, matched one to one:** for each stockist, a venue within 55 km of metro B's centre, of the same Qloo kind (its primary genre, else its genre tags) and as close in Qloo `popularity` as possible (within ±0.01, widening step by step to ±0.20), open, not a chain and not on the brand's list; drawn with the registered seed.
5. **One call:** `filter.type=urn:entity:place`, `signal.interests.entities=<signal>`, `filter.results.entities=<pool>`, `take=<pool size>`. Athena's order is the order returned; unscored pool members tie below every scored one.
6. **Baseline order:** the pool sorted by Qloo `popularity`. Because each decoy matches its stockist's popularity, this should land near 0.5.
7. **Metric:** AUC, the probability that a random stockist ranks above a random decoy, over all stockist–decoy pairs; ties count as 0.5. Also report the share of the pool scored.

**Pass rule (unchanged):** on at least 2 of 3 test brands, Athena's AUC ≥ 0.60, **and** Athena's AUC minus the baseline AUC is ≥ 0.05.

**Why the pool changed (tuning brands, 13 Oct).** The v2 pool (25 random stockists against 25 decoys from pages 1–5 of the no-signal ranking) was told apart by fame alone. Decoys from Qloo's top pages were far more popular than the small shops that stock these brands, so popularity's AUC was 0.03 (Brightland) and 0.00 (Fishwife); Athena's was 0.15 and 0.30; Gemini, reading the names, scored 0.90 and 1.00. That pool tested fame, not taste. Matching each decoy on kind and popularity brings popularity to chance, and keeping only stockists Insights can see stops a gap in Qloo's data counting as a taste miss (Brightland in LA: 37 stockists resolved, 13 visible). **Tuning results on the revised pool:** Athena 0.60 (Brightland, 13 pairs of venues) and 0.67 (Fishwife, 25 pairs); popularity 0.47 and 0.48; Gemini alone 0.74 and 0.85 (§10.6). On 8 Oct an earlier version gave 0.61 on scored pairs only.

**If it passes:** Places shows "Ranking check: measured · AUC [x] vs popularity [y] on [n] of 3 brands", linked to the Method page. **If it fails:** the Method page publishes the result, and nothing on Places says "measured".

### 10.4 What isn't measured

Partners, Message and Moments have no ground truth we can test before judging. (Markets and Next retailers are measured by the Taste Bench, T1 and T2, §10.6.) They're shown with their Qloo evidence chips, a line saying how each was ranked, and the calls that built them, and labelled "demonstrated".

### 10.5 Reporting

Every brand, every metric, raw counts, coverage (match rate, share scored) and caveats go on the Method page and in the README. Nothing is omitted because it looks bad.

### 10.6 The Taste Bench (v4.0, P0, measured; main tests revised 13 Oct)

**How Athena is built, and which layer the Bench tests.** Athena has two layers.
- **Qloo makes every measurement and ranking.** The crowd, what it loves, the cities, the retailers and the venues all come from Qloo's taste graph, read through Athena's methods (§9.3, §9.23, §9.25).
- **Gemini builds on them.** At the start it reads the brand (its traits and lookalike brands seed the graph); at the end it turns Qloo's findings into the founder's plan: each stop's take, the drafts, the questions.

The Bench tests the first layer against real-world outcomes.

**Question.** At decisions a founder makes, judged against real stockists: how much more does Athena get out of Qloo's taste graph than one raw Qloo call, and does Qloo's taste signal beat plain popularity? Secondary: how does an LLM do on the same questions from its own knowledge?

**Arms**

| Arm | What it is | Isolates |
|---|---|---|
| **Athena** | The taste engine (§9.23) and the stop's ranking, as built at the `prereg-v2` commit | — |
| **Qloo-naive** | One Insights call with the seed as the signal, ordered by affinity: what a typical entry does | Athena's methods over raw Qloo |
| **Popularity** | The candidates ordered by Qloo `popularity` (metros: by population) | Qloo's taste signal over fame |
| **LLM-only** | Gemini 3.1 Pro (the model Athena uses), given the same brand context and the same candidate list, asked for a ranking. Run twice: with and without Google Search grounding | Athena's measured rankings vs an LLM's own knowledge (secondary) |

**Tasks** (ground truth from `proof/stockists/`, collected 8 Oct; 25 metros, chain flag reviewed by hand before registering)

- **T1 Where to launch.** Rank the 25 metros. Truth: the brand's stockists per million residents (Census population). Metrics: Spearman ρ, NDCG@5.
- **T2 Which retailer next.** Rank the fixed retailer list (§9.25). Truth: chains with rows in the brand's file. Metrics: AUC, precision@5.
- **T3 Which venues.** The ranking check (§10.3, pool revised 13 Oct), plus an LLM arm that ranks the same pool from names and neighbourhoods. Metric: AUC.
- **T4 Discovery (P1, with §9.29).** From the stockists in metro A, propose 10 venues per round in metro B and reveal which are real stockists. Metric: stockists found in the first 20 and 50 proposals. The one place a large ratio over the LLM is plausible; we claim only what is measured.

**Conditions**
- **Cold start (the headline):** the brand's name is withheld. The seed comes from a registered product description through lookalikes and tags (§9.23 step 1), recorded once per brand and reused by every arm. This is a new founder's real situation, and it stops the LLM from reading the store locator, which would test the web rather than taste.
- **Known brand:** the brand is in the seed and its name is given to the LLM. Reported in full, with the leakage caveat.

**Brands.** Tuning: Brightland and Fishwife, published as tuning data. Held out (8): McClure's, Rishi, Paddywax, Raaka, Dick Taylor, Diaspora Co., Juniper Ridge, MUD\WTR. No Qloo or LLM calls on them for the Bench until `prereg-v2` is tagged; any earlier calls are disclosed. A brand with too little ground truth for a task (for T1, MUD\WTR's file covers 4 metros) is reported as ineligible for that task, never swapped silently.

**Registration (`proof/REGISTRATION.md`, tag `prereg-v2`, by 16 Oct)** fixes the arms, the prompts verbatim, the candidate lists, the metrics, the seeds and the code commit.
- **Primary comparisons (5), cold start:** T1 ρ and T2 AUC, each Athena vs Qloo-naive and Athena vs popularity; T3 AUC, Athena vs popularity (T3's Athena arm is itself one raw call, so it has no naive arm).
- **Secondary:** everything else, including every LLM comparison (LLM-only and LLM + Search, every task, both conditions), registered and published in full.
- **Statistics:** per-brand paired differences with 95% bootstrap CIs over brands (10,000 resamples). **Pass rule per primary comparison:** the mean paired difference Athena − other arm is > 0 and its 95% CI excludes 0. The 5 are judged one by one, with no correction for multiple comparisons. With 8 brands the CIs will be wide, and we say so up front. The §10.3 rule stays as registered.

**Why the main tests changed (13 Oct, before registration).** v4.0 made Athena vs LLM-only the primary comparison on each task. On the two tuning brands, Gemini alone ranked better (cold start, mean of the two brands):

| Task | Athena | Qloo-naive | Popularity | LLM-only | LLM + Search |
|---|---|---|---|---|---|
| T1 cities, Spearman ρ | 0.68 | 0.38 | −0.01 | 0.74 | 0.73 |
| T2 retailers, AUC | 0.60 | 0.49 | 0.55 | 0.73 | 0.75 |
| T3 venues, AUC | 0.63 | — | 0.47 | 0.79 | 0.79 |

These tasks reward general retail knowledge (which grocers carry premium food, which shop names sound like specialty stores), and an LLM already has it. We also gave Gemini Qloo's scores beside each candidate; it did no better than Gemini alone (T1 0.72, T2 0.69, T3 0.79). So the primary tests now ask what Qloo and Athena's methods add, the question the brief poses ("would it work the same without Qloo?"), and the LLM comparisons stay registered as secondary and are published in full. The registration discloses the change (its §12).
- **What we can claim:** Athena's rankings come from Qloo's measured taste, with reasons a founder can check; Athena gets more out of Qloo than a raw call; and Qloo's taste signal beats popularity, wherever the held-out results say so.
- **What we can't:** that Athena, or Qloo's scores, rank stockists better than an LLM does.

**Where it shows.** A Bench page linked from the Method page, with every arm. One quiet line under each stop that has a Bench task, for example *"Metro ranking vs real stockist density, 8 brands: Athena ρ 0.xx · one raw Qloo call 0.xx · popularity 0.xx · Gemini alone 0.xx"*. The line always carries Gemini's number, so a With / Without split (§13.2) never implies more than the Bench measured. The Devpost write-up leads with the Bench table, every arm included.

**Cost.** Qloo: about 300–450 calls per brand (T3's venue resolution is most of it), about 3,600 at most for 8 held-out brands, within the two keys' limit. Gemini 3.1 Pro: about 36 prompts per brand; Search grounding is free for 5,000 queries a month, then $14 per 1,000 (Google Cloud pricing page, read 13 Oct). All inside the credit.

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
| Q5 | Metros | v4.1: `urn:entity:brand`, `signal.location.query=<metro>`, `filter.results.entities=<the crowd's brands>`, one call per named metro. Fallback: `urn:entity:place`, `diversify.by=properties.geocode.metro`, `diversify.take=2`, `take=50`, `filter.exclude.location.query=<home metro>` | Markets | ✅ 14 metros (8 Oct, fallback); 13 Oct: brands method ρ 0.73 and 0.62 vs stockist density on the tuning brands |
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
| Q21 | Affinity scores | `/v2/insights`, any entity type: `query.affinity` per result | Taste graph | ✅ 10 Oct |
| Q22 | Tags as a starting signal | `/v2/tags?filter.query=<trait>` → `signal.interests.tags` | Taste graph step 1 | ✅ 10 Oct for brands; generic for venues (8 Oct) |
| Q23 | Crowd skew | `urn:demographics` with a crowd's entities as the signal | Crowd cards, Online | ✅ 10 Oct: three Liquid Death crowds gave three distinct skews (emo-rap artists: ≤ 34, gender-neutral; Dr. Squatch, Voodoo Ranger, Slim Jim: male +0.69; skate brands: male +0.61, age weak), while the brand alone gave a blend (45–54, male +0.43) |
| Q24 | Weighted signals | `POST /v2/insights`, `signal.interests.entities: [{id, weight}]` | Crowd reactions | ✅ 10 Oct: gradual shift (3× → 5 of 10 results from the heavier brand) |
| Q25 | People as creators | `urn:entity:person`, `filter.popularity.max=0.9`, tag rules (§9.24) | Online | ⚠️ 10 Oct: strong for niche brands (Brightland → Alison Roman, Samin Nosrat), noisy for broad ones (Liquid Death) |
| Q26 | Retailers by crowd fit | `urn:entity:brand`, `filter.results.entities=<retailer pool>`; and `filter.tags=urn:tag:genre:brand:retail` | Next retailers (§9.25) | ✅ 10 Oct: Erewhon, Eataly, Williams-Sonoma high; Walmart, Kroger low |

**Not available on the hackathon endpoint (8 Oct):**
- `/v2/trending` returned an empty list even for Taylor Swift, across three date ranges.
- Locality enrichment tags (`{month}_event`, `peak_tourism_month`) are absent.
- `output.heatmap.boundary=urn:entity:locality` returned HTTP 500.

**Probed 12 Oct and cut:**
- `/v2/trending` needs a signal entity (without one: 400), and returned an empty list for Madi Diaz and Taylor Swift over 4 weeks.
- `/v2/analysis/compare` works over GET only with lower-case UUIDs (upper case: 400; POST: 404); Brightland vs Great Jones returned no shared tags.

Athena doesn't depend on any of these.

**Tested on 8 Oct and not used** (Brightland, cafés in Chicago, top 20):
- `signal.demographics.audiences` alongside the brand: 0 of 20 positions changed, for both Veganism and Finance Professional. With an audience as the only signal, results were generic (Starbucks, Corner Bakery).
- `signal.interests.tags` with a theme tag: alone, it gave near-identical affinities and generic venues (1 of 20 overlapping the brand-only list); added to the brand, 19 of 20 venues stayed and one tag-heavy venue jumped to first. For partners, it swapped 2 of the top 10. `signal.interests.tags.weight` was accepted, but the result matched the brand-only list.
- `filter.location.query` on `urn:audience`: no change from the national list.

**Limits on our key (verified 10 Oct, from the response headers):**
- **5 calls per second** (`x-second-ratelimit-limit`). A burst of 40 calls at 10 in flight returned 27 × 429.
- **10,000 calls per month** (`x-month-ratelimit-limit`); 8,462 were left on 10 Oct, resetting in about 28 days.
- More headroom is being requested separately (Discord `#api-help`).
- **12 Oct: a second key** (the second teammate's) doubles both, to **10 calls a second and 20,000 a month**. The client treats each key as a lane: each call goes to the key with the most headroom, a 429 fails over to the other key, identical in-flight calls are shared, and slow calls are hedged.

**Budget per plan (v4.0):** taste engine ≤ 110 calls (measured 102 on Brightland), cached 24 hours. (v3.0: taste graph ≤ 40 calls, plus ≤ 30 across the stops a founder visits; at most 70 for any plan. v2: R1 about 31, R2 about 23, R3 about 27.)

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
| **US Census Bureau API**, ACS 5-year (2020–2024 vintage) | Qloo has no market size | Metro population (`B01003_001E`) and median household income (`B19013_001E`) for any metro shown, by CBSA code | Once per metro; cached for good | Free; requires a key. Values are labelled "Census, ACS 2020–2024, aggregate" |
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

**v3.0:** one conversational agent across the journey. In Chapter 1 it leads the conversation (what it learned, then at most one question, never repeated; code enforces only the required facts and the turn caps). At each stop it writes a short streamed take, a recommendation and the options, from the stop's Qloo results. Its first reply each turn uses **Gemini 3.1 Flash-Lite** (`gemini-3.1-flash-lite`, answered in 1–1.8 s on 9 Oct), streamed and hedged: a duplicate request starts after 2.5 s with no text, and the first to stream wins. The product read, crowd naming and follow-ups use Flash. Web research (grounded Search, cached per brand for 7 days) runs in the background and never blocks a stop.

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

- **Header line:** the title, the subtitle and the computed comparison line (§2.2). It collapses after the first message.
- **Left: the conversation.** Athena's messages, the founder's replies, the live activity trail under each reply (steps ticking off, the pages it read), and each stop's prompt and choices.
- **Right: the canvas.** The "What I understood" card during Chapter 1; then each stop lands as a card as it completes, so the canvas is the plan being assembled. The map sits in the canvas from the Where stop on.
- **Top: the progress rail.** The stops for this founder's growth types (for example *Product · Crowd · Where · Places · Partners · Message · Go*), done ones ticked, any one clickable. Beside it: *Without Qloo* (on Places) · Trace · Sources · **View full plan**. A fallback banner appears here only when §14.2 applies.
- Each stop's card shows "Built from [n] Qloo calls" (F14) and one muted line on how it was ranked, in plain words with no slogan.

### 13.2 Screens

- **Landing page** (`/`) and **Start** (`/start`): §2.2
- **The journey** (`/plan`): the conversation, the canvas and the progress rail (§13.1)
- **The stops.** Each one: Athena's take (streamed) → the recommended choice → options to explore → **Continue**, with "Show me why" (opens the trace).

  | Stop | The choice | Options to explore |
  |---|---|---|
  | Product | Looks right / Edit | The "What I understood" card, every field with its source |
  | Channel and growth | Online/offline; 1–3 growth types | Why Athena suggested each one |
  | Crowd | Which crowd (for New crowd: which adjacent one); That's us / Partly / Not us; the agent's one question | The Taste Galaxy (§13.11): hover any entity for why, pin it "us" or "not us"; open a crowd: loves by domain, labelled skew, cities |
  | Where | Starting city | Heatmap, neighbourhoods, "what if [city]" for any US city (§9.3) |
  | Places | Shortlist | Filter by type; venue drawer; field-day route; Without Qloo |
  | Next retailers (Deepen) | Shortlist the next 3–5 retailers | Why each fits (affinity, shared loves); which the brand is already in; a buyer-pitch draft |
  | Partners | Shortlist | Brands and podcasts; mutual fit; "more like this one" |
  | Online | Shortlist | Creators, podcasts, ad interests and audiences to test, content angles |
  | Message | The angle | Regenerate in another tone; see it per crowd |
  | Moments | Add to calendar | Filter by month or city |
  | Go | Open the dashboard | Export the one-page brief |

- **The dashboard (the advanced view):** the whole plan on one screen (crowd, map, shortlists, message, calendar, pipeline), sharing state with the journey, so a change in either shows in the other. It's where the pipeline is worked (stages, drafts, wins and declines, re-rank; F17–F19), where returning founders land, and where two crowds can be compared side by side. Opened from **Go**, or **View full plan** at any stop.
- **Venue drawer** and **partner drawer**
- **Trace drawer**
- **Actions tray:** drafts and route
- **Method page**, **Sources page**, **What we don't know**

**v4.0: With / Without on every stop (planned 17–19 Oct).** Each stop shows Athena beside Gemini alone answering the same question, with that task's Bench line under it, Gemini's number included (§10.6), or "demonstrated" where the stop has no Bench task (§10.4). Until then Without Qloo stays on Places. "Show me why" is on every stop.

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
- Each stop's card rises into the canvas, and the rail ticks.
- A re-route (a changed earlier choice) re-ranks the affected cards over 400 ms, with the "what moved" note.
- Re-ranking animates over 400 ms.
- With `prefers-reduced-motion`, states change instantly.

### 13.6 Phones (< 640 px)

- The map sits on top at 45% of the screen height.
- The panel becomes a bottom sheet with the same tabs.
- The rail shrinks to one line.
- The conversation runs full width; the canvas becomes a bottom sheet; the progress rail becomes a step counter; the comparison metrics stack.
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

### 13.11 The Taste Galaxy (v4.0)

The crowds as a map the founder can touch. It sits at the top of the Crowd stop, above the crowd cards.

- **Nodes:** every entity the crowd loves (about 150). **Shape is the domain** (circle brand, triangle music, square TV, diamond film, hexagon podcast, rectangle book), **colour the crowd** (never colour alone, §13.4), **size the specificity** (§9.23 step 8), and a ring marks a probed landmark. A star marks the seed.
- **Core and fringe:** a crowd's core is solid and its fringe faint (§9.23 step 4). Hulls are drawn round each core and labelled with the crowd's name.
- **Layout:** each round's spectral coordinates are the targets of a small force layout (`d3-force`), aligned between rounds so the map doesn't flip. Edges (top 3 similarities) show only for the entity in focus.
- **It forms live; the forming map is the progress narration.** Round 0 places each domain in its own sector, nearer the middle the more the seed's crowd loves it; each probe round then pulls the entities into crowds, with one line per round ("Round 2: 11 probes, 70 Qloo calls so far"). There is no spinner and no failure state.
- **Hover** opens a card: name and domain; core or fringe of which crowd; "Ranked highest by" the three landmarks that rank it highest (from probes already made, 0 calls); the specificity line; "In this crowd in N% of resamples; shuffled data reaches M%".
- **Click** pins the card: "Our customers love this" or "Not us" (§9.23 step 7). Pins change every later ranking. **P0, planned 14–16 Oct: click to probe**, which runs the entity as a new landmark (about 6 calls, narrated) and re-forms the map.
- **The agent's one question** sits under the map: "Would your customers love [entity]? It sits between [crowd] and [crowd], so your answer tells me which way to lean." Yes / Not really; then "Noted…" with Undo.
- **List view:** the same entities as lists by crowd, core first, with the same pin buttons; it is the accessible equivalent and the phone layout (< 640 px).
- **Method line:** "[n] things this crowd loves, placed by how [p] probe entities rank each one. [c] Qloo calls. Solid: a crowd's core, placed more surely than shuffled data allows."
- **Planned (17–22 Oct):** linked views with the map (§9.26), axis sliders (§9.27), lasso a custom crowd (P1).
- **Respects reduced motion:** the layout settles at once.

### 13.12 The Brand Graph (v4.2, proposed 14 Oct; v5 additions in §23.1 problem 4)

What Athena understands about the brand, as one graph the founder can see, edit and grow. It replaces the static "What I understood" card (J1, §6.2) and is built on the Taste Galaxy (§13.11): one graph, not a second one.

- **Two layers:**
  - **A slim fact strip** above the graph: name, what it sells, channel, tier, stage, home city, each with its source label and edited in place. A graph is a poor way to confirm a fact, so the facts stay as a strip.
  - **The graph below it:** the brand at the centre; its comparables, competitors and stockists; the crowds (§9.23) and what they love, each a real Qloo entity; and the founder's own facts as small labelled anchors ("premium", "Brooklyn", "sold online").
- **Small first, then grows:** it opens with about 15–25 nodes (brand, comparables, crowds, top interests). Each play (§13.13) adds its results as new node types: cities, neighbourhoods, venues, retailers, partner brands, podcasts, moments. A node type's nodes fold into a group past 12, so the graph never becomes a tangle.
- **v5 (§23.1 problems 1–4):** crowd nodes carry their Win first / Win next / Watch tier and reason; every node shows its source (website, a file, Qloo, or you); time-sensitive nodes show when they matter; the list view is the main way to read the graph; stale plays get a one-click re-run.
- **Edges say why:** comparable of, loved by [crowd], shares fans with (bridges, §9.8), the path from crowd to crowd (why-paths, §9.28), sold at, found by [play]. Hovering an edge shows its reason and source.
- **Edit directly:**
  - Click a node to open its card. Remove it (hides it) or mark it wrong (also teaches the agent to stop inferring it). The founder edits facts, never taste: there are no "That's us / Not us" pins (problems.md, problem 1).
  - Add a node by typing: a comparable, a competitor, a stockist, a city. It is resolved through Qloo (§9.1) or the place resolver (§9.3); nothing is added that can't be resolved.
- **Edit through chat (implicit):** anything the founder says in the chat box ("we're actually more premium", "we just got into Whole Foods", "skip Austin") goes through the same brief merge as §9.22. The graph updates, and the changed nodes flash once with a one-line note ("Moved to premium: from your message") and Undo. The founder's words always beat a file, which always beats a guess.
- **Edits re-run only what they touch:** each edit marks the plays whose inputs changed as stale ("Cities may change: you added a comparable. Re-run?"). Nothing re-runs silently, and nothing already decided is thrown away.
- **No failure states (§2.1):** nodes appear as calls return, and the forming graph is the narration. An unresolved addition becomes a question ("Did you mean Sightglass Coffee, SF?"), never an error.
- **Extensible:** node and edge types come from one registry (`lib/graph/types.ts`). A new feature registers its node type, shape and edge reasons, with no change to the graph view.
- **List view:** the same nodes as grouped lists with the same actions. It is the accessible equivalent and the phone layout (< 640 px), as in §13.11.
- **Library:** the Galaxy's `d3-force` layout, extended with zoom and pan, colour and shape by node type (never colour alone, §13.4), and reduced motion respected.

### 13.13 Plays (v4.2, proposed 14 Oct; changed in v5, §23.1 problem 5)

**v5:** the agent reads the Brand Graph and proposes 3–5 goals for the brand right now; the founder picks one or several (conflicting goals can't be picked together), the recommended one first, or writes their own under Other. Plays become the agent's tools, in seven groups: **Taste, Fans, Where, Shelves, Partners, Events, Insights**. "Prove" becomes a quiet "how we know" link on each result (With / Without, plus the Bench line with Gemini's number). The v4.2 text below stands where it doesn't conflict.

The ways into the journey, laid out as a catalogue grouped by the founder's question. A play is not a separate tool: picking one sets the growth type (§7.8), opens the journey at the right stop, and its results land on the Brand Graph and in the plan. The internal playbooks (§7) stay hidden; plays are the founder's view of them.

| Group | The founder's question | Plays (titled by outcome) |
|---|---|---|
| 01 · Know your taste | "Who actually loves us?" | See your brand's taste fingerprint (§9.2) · Meet the crowds that already love you (§9.23) · See what else your crowd loves (§9.8, §9.17) · Find where you sit against rivals (§9.16, §9.27) |
| 02 · Win more fans | "Who else would love this?" | Find the next crowd to win (New crowd) · See the path from your crowd to theirs (§9.28) · Get the words that land with them (§9.15) · Build a mood board for the crowd (§9.21) |
| 03 · Go where they are | "Which cities and neighbourhoods?" | Rank the cities where your taste is strongest (§9.3, §9.26) · Name the neighbourhoods to start in (§9.4) · Pick your next city (New city) · Find where to open a store (Own location, Beta) |
| 04 · Get on shelves | "Where should we be sold?" | Find shops your crowd already shops at (§9.5) · Plan a field day of shop visits (§9.12) · Step up to bigger retailers (§9.25) · Write the pitch to a buyer (draft) |
| 05 · Borrow an audience | "Who should we team up with?" | Find brands to collab with (§9.6) · Find podcasts your crowd listens to (§9.6) · Write the collab or sponsorship ask (draft) |
| 06 · Show up and sell online | "When and where do we show up?" | Find the events and moments to be at (§9.18) · Target your crowd online (§9.24) · Write the event inquiry (draft) |
| 07 · Learn and sharpen | "Is it working?" | Tell Athena what worked (§9.7, §9.29) · See what Qloo changed in your plan (§9.9) |

- **Card anatomy:** outcome title; the feature name as a small label; one line; time ("~20 s"); Qloo calls; status (Ready / Beta / Soon). Prerequisites grey a card out with the reason, never hide it (§7.8).
- **Filters and search:** one pill per group, plus "In my plan"; a search box. All built from the registry.
- **Open by design:** every play is one entry in `lib/plays/registry.ts`:

```ts
type Play = {
  id: string;
  group: "taste" | "fans" | "where" | "shelves" | "partners" | "events" | "insights";
  title: string;              // the outcome, in the founder's words
  label: string;              // the feature name, shown small
  blurb: string;
  estSeconds: number;
  qlooCalls?: number;
  growthTypes: GrowthType[];  // §7.8
  startsAt: StopId;           // where the journey opens
  adds: NodeType[];           // what it puts on the Brand Graph (§13.12)
  needs?: Prereq[];           // greyed out with the reason
  status: "ready" | "beta" | "soon";
};
```

  A new feature (for example web search, §11.2) is one new entry; the page, filters and graph pick it up.
- **Styling** (from the UX audit, `ux-pattern-audit.md`, 14 Oct): one display face for headings, spaced small-caps labels and tabular numerals for data, with our own type pairing (not copied). Light and dark themes come from tokens.

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
| Tests | Vitest for the methods; Playwright for the sample-pack path and a phone viewport |

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
- **Input:** *(v5 replaces this rule with the safe crawl in §23.1 problem 3 C: public addresses only, SSRF checks on every redirect, caps, `robots.txt`.)* Athena's server never fetches URLs users supply. Website reading goes only through the Vertex URL context tool, after the URL checks in §9.20.
- **Uploads:** ≤ 10 files per brief, ≤ 15 MB each, ≤ 40 MB in total. The type is checked from the file's bytes, not its name. Files are processed in memory and never stored; only the brief is kept with the session. Macros and embedded objects in Office files are ignored.
- **Follow-ups:** ≤ 4 follow-up turns and ≤ 6 Gemini ingestion calls per brief; they count toward the own-brand cap.
- **Journeys (v3.1):** a whole journey counts **once** against the own-brand cap; its stop runs don't add to it. A dev-only `ATHENA_NO_LIMITS` flag (ignored in production) lifts caps for local testing.
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
- End to end: a fresh browser runs a sample pack to Go; the comparison line equals the metrics computed offline from the same cached answer; a forced outage shows the fallback banner; the phone viewport works.

**README** contents:

- the problem and the live URL;
- "No login. The app is live when you arrive: pick a sample brand, or try your own.";
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

1. **Warm cache for the sample packs:** the daily `warm-cache` job replays every Qloo call the three packs need and stores the responses (24-hour TTL). Pack stops then load fast, because the ranking code recomputes from cached responses (§2.1).
2. **Streaming order for own brands:**
   - the Read card first (tag calls are fast);
   - then blocks in recipe order, each rendered as soon as its own calls return;
   - the agent rail narrates while slow calls run.
3. **Parallel calls, paced:** independent Qloo calls run concurrently through the shared pacer below (v2 allowed 6 in flight, more than the key's 5 a second).
4. **Pages:** Places requests page 2 only on "Show more".
5. **Targets:**
   - first card line ≤ 3 s;
   - demo blocks ≤ 5 s;
   - own-brand first block ≤ 30 s median;
   - own-brand full plan ≤ 120 s median.

   A run that exceeds 180 s shows what it has, plus the thin label.

**v3.0 pacing (the per-second limit is what the founder feels):**
- **One Qloo pacer for the whole server,** shared by every visitor: never more than the key's per-second limit (5 today), replacing retries on 429 as the main defence.
- **Priority:** calls whose results the founder sees first go first, so each stop's first results land within about a second and the rest stream in.
- **Reading time is used:** while the founder reads a stop, idle capacity prepares the likely next choice (for example the top crowd's cities), **capped at 5 background calls per stop [DECISION]**. It never moves ahead or decides anything.
- **The taste graph starts as soon as the product is clear,** during the channel and growth questions, so the Crowd stop is mostly ready when the founder gets there.
- **Several visitors share the 5 a second.** Repeat brands and packs come from cache; this is the main argument for more headroom (§11.1).
- **Built (v3.1):**
  - **Prefetch:** once a stop's inputs are settled (a crowd, plus a city where the stop needs one), the next stop starts loading in the background; changing the city re-runs only the stops that use it.
  - **Partners streams:** its lists show after the first 3 calls; mutual fit, Who listens (top 3) and enrichments run side by side and update the cards as they land. Measured cold: first results 10.8 s, done 17.9 s (was 31 s).
  - **Business read once:** the classified business is cached for an hour, so stop runs don't redo it.
- **Targets (v3.0):** first streamed reply ≤ 3 s; each stop's first results ≤ 2 s after the founder's choice; the Crowd stop ≤ 10 s after the product is clear.

**v4.0 (12 Oct):**
- **Two keys, 10 calls a second** (§11.1). *Measured 12 Oct:* 20 distinct calls in 3.55 s, all 200, no 429s; the same query on both keys at once took 3,882 vs 3,894 ms, so latency depends on the query, not the key.
- **Taste engine:** 102 calls and about 17 s cold on Brightland; the first map (after round 1, about 54 calls) shows within seconds, and the forming Galaxy is the narration. Bootstrap and the shuffled-data check take under 2 s.
- **Quota guard:** below 2,000 calls left over both keys, landmarks drop from 16 to 8; below 500, only cached results and the sample packs, with one calm line and no failure state (planned).
- **Quota on 12 Oct:** 7,380 calls left on key 1 (resets about 6 Nov) and 9,967 on key 2 (about 11 Nov). Planned use before 2 Nov: development about 4,000, Bench about 2,100, warm cache about 900, QA about 1,000.

---

## 15. Responsible use

- **Inputs:** business names and addresses, brand names, city names, a one-line description, website URLs the user gives, and images of lists the user uploads. Never consumer or personal data.
- **Outputs:** venues, brands, podcasts, creators (in their professional role), crowds (groups of entities, never people), cities, neighbourhoods, taste tags, cultural references, dated events, and aggregate audience skew and audience interests under the rules below.
- ***No customer is ever modelled, and no private individual is ever a target.***
  - A crowd (§9.23) is a cluster of brands, artists, shows and places, never of people.
  - Creators (Qloo's person type) can be partners in their professional role, like podcasts (§9.24): filtered by their Qloo tags, nothing inferred about them, contacted only through the founder's own drafts.
  - Artists appear only as cultural references and as performers of public events, never as people to contact.
- **Aggregate audience skew** (§9.17):
  - It's shown on crowd cards, in Message and in the Online stop, always with the fixed label text.
  - In the Online stop, a clear skew may be suggested as an ad audience **to test** (§9.24).
  - It's never used in a filter, ranking, recipe decision or draft.
  - It's never phrased as a fact about the brand's customers.
- **Audience interests** (§9.17): only four audience types (hobbies and interests, leisure, spending habits, professional area). Communities, political preferences, lifestyle and beliefs, global issues, life stage and investing interests are never shown or stored. The same label and the same never-used-for rules apply. The Online stop may suggest allowed interests as ad interests to test.
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
  - The sample packs (all real brands) use only each brand's public website, public store locator and our own description, labelled not affiliated; nothing is made up about any company (§7.7).
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
| Clarity | Versatility test after running two sample packs | 3 of 3 first-time users can say how the three plans differ |
| Time | The comparison reached from arrival, through a sample pack | ≤ 90 s |
| Speed | First card line; each demo block (warm cache); own-brand first block; own-brand full plan | ≤ 3 s; ≤ 5 s; ≤ 30 s median; ≤ 120 s median |
| Reliability | Errors on the sample-pack path across 5 fresh-browser rehearsals | 0 |
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
- **Builder B:** the map, motion, the journey's stops and progress rail, the dashboard, the phone layout and write-up assets.

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

**v4.0 plan (12 Oct; replaces the rows above from 13 Oct on).** Builder A: engine and Bench. Builder B: Galaxy, map and stops. Both: prereg, QA and write-up.

| Dates | Builder A (engine, Bench) | Builder B (experience) |
|---|---|---|
| 12 Oct (done) | Two-key client; taste engine (probes, spectral crowds, bootstrap, shuffled-data core, specificity) | Taste Galaxy: forming map, hover, pins, the agent's question, list view |
| 13–16 Oct | Bench harness with the LLM arm; Brightland tuning run; **write and tag `prereg-v2` (ranking check + Bench) by 16 Oct** | Click to probe; Galaxy polish |
| 17–19 Oct | Run the Bench on the 8 held-out brands; crowd geography (§9.26) | Map linked to the Galaxy; crowd weather; With / Without on every stop |
| 20–22 Oct | Axes (§9.27); bridges and why-paths (§9.28); quota guard; **deploy to Cloud Run; warm cache** | Sliders; lasso; why-path Sankey; Bench page |
| 23–25 Oct | P1: learning loop and T4 (§9.29); MCP server (§12.9) | Phone layout; accessibility pass; Try your own brand end to end |
| 26–28 Oct | QA; 5 fresh-browser rehearsals; README, Method and Sources pages built around the Bench | Devpost text led by the Bench table; GIFs of the Galaxy; video. **Submit 28 Oct** |

**v4.0 cut ladder (before the list below):** the MCP server; the learning loop and T4; lasso; axis sliders (keep the axes as labels); Gi\* (keep the top cells, population-weighted); the why-path Sankey (keep a one-line why); landmarks down to 10. **Never cut (v4.0):** the taste engine with its shuffled-data check; the Bench, run and published whatever the result; the Galaxy with hover, click and pin; With / Without with the Bench line; the quota guard.

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
| Audience skew is misread as customer data | The fixed label text (§9.17), hidden when weak, never used for ranking, offered for ads only as something to test, a code test |
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

- [ ] Live URL, no login; the app is live on arrival, and the sample-pack path works on desktop and on a phone
- [ ] Deep links from the Devpost page to the Without Qloo comparison and to each demo brand
- [ ] Public repo; MIT license visible in About; setup from a clean machine; `.env.example` only; tests run with one command
- [ ] Devpost text (§20.2) with the real computed numbers, including the failed blind test
- [ ] Redacted request → result examples: one bridge, one mutual fit, one positioning card and one moment, each traced to its calls
- [ ] Screenshots with no keys or personal data: Places with Without Qloo flipped, a venue drawer, the Message block, the Moments block, the trace, the re-rank, a draft, the app plan, the hardware plan
- [ ] GIFs of the Without Qloo flip, the re-rank and the brand switch (the panel reordering itself)
- [ ] The "How Athena uses Qloo" diagram (`docs/QLOO.md`), showing which gaps each other source fills
- [ ] The Sources page with every attribution (§15)
- [ ] The demo disclaimer for real brands
- [ ] A 2-minute video recorded from a real session, running a sample pack
- [ ] Both owners, Siddhant and Jaiaditya, are on the Devpost project team before submitting
- [ ] Free to test through 17 Nov; the billing account still a non-billable Free Trial account

### 20.2 Devpost write-up outline

The headings mirror the judging criteria, so both people and automated screeners find each answer.

1. **The line and the comparison:** "Same question, two answers", with the hero's computed numbers.
2. **The problem:** Maya, Dev and Lena.
3. **What it does:** the six blocks, the key moments, the two versatility demos, and *Try your own brand*.
4. **Technological implementation:** the Qloo capabilities table (§11.1), the methods, one bridge, one mutual fit and one positioning card traced to their calls, the gap-filling sources (§11.2), the tests.
5. **Evidence:** With Qloo vs Without Qloo for every demo brand; the failed blind test and what we changed; the ranking check's registered result; what isn't measured.
6. **Design:** a product-first conversation, a step-by-step journey where every stop is a decision, crowd cards from a real taste graph, the dashboard, phones, accessibility.
7. **Potential impact:** three users, quotes from real brands, a market across goods, tech and apps, the business model and its data terms.
8. **Quality of the idea:** places and partners as a taste fingerprint; lookalike places, partners and moments; mutual fit; outcomes as signal.
9. **Responsible use**, including the audience-skew and audience-interest rules.
10. **What we don't know.**
11. **Built with, setup and testing:** "No login. The app is live when you arrive: pick a sample brand, or try your own."

### 20.3 Emphasis by judge

| Judge | Lead with |
|---|---|
| Jason Calacanis | The 1-to-n story, the market across goods, tech and apps, the real brand using it, who pays |
| Mike Diolosa (Qloo CTO) | The Method page, the trace and the per-block Qloo call counts, the 15 Qloo capabilities, the honest key-day findings, shared-pool positioning |
| Nicole Seligman | Aggregate taste, never individuals: crowds are clusters of brands and places, not people; sensitive audience types never shown or stored; skew labelled and offered only as something to test; creators approached in their professional role through human-sent drafts; human approval; alcohol out of scope |
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
2. **Demos:** **three context packs, all real brands from public material only** (decided 10 Oct, §7.7): **Brightland** (hero, offline), **Starface** (online-first) and **Fishwife** (not in Qloo; shows the retail step-up). Nothing fictional. Messy-file reading is shown whenever someone uploads their own files. The v2 demo brands stay in tests.
3. **Ranking-check test brands (decided 13 Oct):** **McClure's Pickles (G1), Rishi Tea (G2), Paddywax (G4)**, registered in `prereg-v2` by 16 Oct. MUD\WTR, the G2 alternative, isn't used (§10.3). Fishwife was swapped out on 10 Oct because it became a sample pack (§10.3).
4. **Fifth tuned category:** **G4 home** (Paddywax has 13 qualifying metros), replacing the earlier G3 default. Beauty stays Beta: only Juniper Ridge qualified, in 2 metros.
5. **Target metro:** chosen by the founder at the Where stop (v3.0); no fixed demo metro.
6. **Models:** **Gemini 3.8 Flash (`gemini-3.8-flash`) for the agent, Gemini 3.1 Pro (`gemini-3.1-pro-preview`) for draft retries and Without Qloo (with Search grounding), all on Vertex AI's `global` endpoint**, paid from the credit (§12.8). Claude can be added later through the Claude API, billed separately.
7. **Decline weight λ:** **0.5**.
8. **Bars:** **off by default in every category**; founders can add them on the card.
9. **Partner types:** **brands, podcasts and creators** (creators under §9.24's rules, decided 10 Oct); artists and TV shows as shared loves only (P1).
10. **Reach window:** **`filter.popularity.max` = 0.97** for pre-launch and early brands.
11. **Hosting:** **Cloud Run (1 warm instance, request-based billing) with Firestore, BigQuery, Secret Manager and Cloud Build, in `us-central1`; Gemini calls on the `global` endpoint**, all paid from the $300 Google Cloud credit (§14.1, §14.8).
12. **Real brand names in demos:** **yes, all three packs, from public material only, each labelled not affiliated, with outreach; anonymise on request** (decided 10 Oct).
13. **Caps:** as in §14.5.
14. **Price points to test:** **$99 and $299 a month.** Moments shows in a paid tier need a Ticketmaster agreement first (§11.2).
15. **Who builds what:** the split in §17, assigned between Siddhant and Jaiaditya.
16. **Audience skew and audience interests:** **shown, under the rules in §9.17** (decided 8 Oct); interests limited to **hobbies and interests, leisure, spending habits and professional area**. From v3.0 both may be suggested as ad audiences **to test** in the Online stop (decided 10 Oct).
17. **Competitors for positioning:** **the user's (up to 3); otherwise the top 2 peers from the mutual-fit peer set (Q10).**
18. **Signal per block:** **brand entity plus comparables for Markets, Partners, Message and Moments; accounts for Places and the Read card** (decided 8 Oct, §7.5). From v3.0, the chosen crowd's weighted entities replace brand-plus-comparables after the Crowd stop.
19. **Pacing:** **step by step**, each stop waits for the founder (decided 10 Oct).
20. **Growth types:** **up to 3**, Athena pre-selects 1–2 (decided 10 Oct, §7.8).
21. **Crowds:** **2–3, Louvain first, graph ≤ 40 calls; reaction weights: chosen crowd 3, Partly 1.5, Not us excluded, unreacted crowds left out** (v3.2) (§9.23).
22. **Editing an earlier stop:** **later stops re-run automatically**, with a "what moved" note.
23. **Background calls while the founder reads:** **≤ 5 per stop** (§14.9).
24. **Without Qloo:** **Places only** (v2.11's reason holds).
25. **Cities:** **any US metro, from the crowd or typed; the 25 largest kept only for the ranking check and the proof** (decided 10 Oct, §9.3).
26. **Retail step-up:** **part of Deepen; top 5 retailers by crowd fit, excluding ones the brand is already in** (decided 10 Oct, §9.25).

---

## 23. Next version (v5): problems and build plan

Written 14 Oct, after the founder's review of the v4 build. **§23.1 is `problems.md` copied verbatim** (problems 0–5, headings moved under §23.1). §23.2 turns them into the build order for v5. Where §23 conflicts with an earlier section, §23 wins until that section is rewritten during the build.

### 23.1 The problems (verbatim from `problems.md`, 14 Oct)

#### 0. Overarching: Athena is a pipeline, not an agent

**In your words (14 Oct):** "Are we just multiple API calls of Qloo and Gemini patched together, or are we truly agentic? Be brutally honest." And: "This is more of a general, overarching problem; my further problems will discuss this in detail."

**Scope:** this problem sits above all the others. Each later problem (the Galaxy, onboarding and the rest) is a specific place where it shows, and each will be worked out in its own entry. This entry sets the principle they all follow.

**The problem, precisely (checked in the code, 14 Oct):**
1. **Our code decides every step, never the model.** The journey runs in a fixed order: Product → How to grow → Crowd → Where → Places → Next retailers → Go.
2. **Gemini has no Qloo tools.** Its only tools are Google Search and reading a URL. It never calls Qloo, never sees a result and decides to dig further, and never changes course. There is no plan → act → observe → re-plan loop anywhere.
3. **Gemini's jobs are narrow single prompts:** understanding the brief, reading the website, picking lookalikes, naming crowds and axes, and writing a paragraph for each stop.
4. **The most adaptive part is not an agent.** The taste-graph engine chooses its own probes and when to stop, but by a fixed algorithm (k-center, then a stopping rule).
5. **It matters for judging.** The theme is "Agents, but with taste". Stage 1 is a pass/fail on fitting it, and a judge reading the code would see a pipeline. The rules accept "functions as an agentic tool" *or* "built using an agent framework", so either route qualifies. A framework is not required.

**What it should be instead:** the agent makes the decisions and the deterministic engine does the measuring.
- **Tools, not a script.** What is built becomes the agent's tools:
  - Qloo: search, insights, demographics, build graph, probe, geography, axes
  - Real world: Wikipedia momentum, Ticketmaster, Census, web search, read website
- **A goal and a budget,** for example: "Decide who this brand should win first, and how; 150 Qloo calls, 60 s." The agent picks the order.
- **It reacts to evidence.**
  - A soft crowd → probe more.
  - Fading momentum → check the adjacent crowd.
  - Small reach → follow the bridges.
- **Every claim cites a tool call.** Code rejects numbers with no source.
- **The narration is the agent's real steps,** so the no-failure-state rules still hold.
- **It asks the founder only what only the founder knows:** budget, goals, margins, constraints. Never taste.

**Constraints:**
- **Hard caps in code:** turns (about 8–12), Qloo calls and seconds.
- **Fallback:** when the agent stalls, the current fixed pipeline runs instead, so there is no failure state.
- **Bench methods stay deterministic tools, exactly as registered.** The agent chooses among them and never changes how they score.

**Framework (recommended, not yet decided):** our own loop on Gemini's built-in function calling, about 150–200 lines of TypeScript. The Vercel AI SDK is the alternative. LangGraph is overkill. For Google's ADK, TypeScript support is [VERIFY].

---

#### 1. The Taste Galaxy shows the measurement and asks the founder to finish the job

**In your words (13 Oct):** "You're not supposed to ask me whether my customers would like this or that. You need to evaluate the graph as well as related real-world trends and parameters to create a marketing and growth strategy for the highest predicted yield parts of the taste graph... It should be flipped, that's the whole point."

**The problem, precisely:** the Galaxy shows *how* Athena measured taste, then asks the founder to supply taste judgments. It should show what the measurement *means* for growth and tell the founder what to do.

1. **It's a picture of the instrument, not an answer.** About 150 entities placed by probe rankings put the method on display. The founder is left to interpret it. "These 40 things sit near each other" is not something a brand manager can act on.
2. **It treats the founder as the oracle.** The agent's one question ("Would your customers love X?"), pins and That's us / Partly / Not us all ask the founder for taste judgments. That is the one thing Qloo knows and the founder doesn't. The question is chosen by uncertainty sampling, which picks whatever would most improve Athena's model: engineering logic, not the founder's.
3. **Similar is not the same as valuable.** The map's geometry answers "how is this taste organised?", but the founder is asking "where do I grow?" A tight, coherent crowd can still be small, saturated, fading or expensive to reach, and clustering can't tell those apart.
4. **Nothing on the map shows value.** Colour is the crowd, size is specificity and position is similarity. Nothing shows reach, momentum, timing or spending power, so every part of the map looks equally worth pursuing.
5. **The default target is where the brand already is.** The "main crowd" is simply the one closest to the seed. That is a defensive default: growth often sits in an adjacent crowd, and nothing makes that case.
6. **It's a closed world.** The map uses only Qloo's graph, with no real-world trends, events, geography or spending power. Without them it can't say anything about payoff.
7. **The interactions feed the model, not the founder's decision.** Pin and probe refine the measurement. None of them answers "what if I went after this crowd: who, where, through what, and when?"

**What it should be instead:** a decision surface. It shows the taste map with Athena's judgment over it: where the opportunity is, how strong it is and why. Athena ranks the crowds itself, and every claim traces back to the graph or to a real-world signal. The founder decides strategy and is never the source of taste data.

**Already decided:**
- **Headline:** "Who to win first", with tiers **Win first · Win next · Watch**, leading into "How to win" for the top crowd.
- **Removed entirely:** the one question, the That's us / Partly / Not us reactions and pins. Only "Plan for this crowd instead" stays.
- **No "predicted yield" claim.** There is no sales or outcome data, and the Bench showed Gemini alone ranking stockists better than Athena. Instead, each tier shows its reasons:
  - brand fit
  - addressable reach (Census)
  - efficiency (specificity)
  - cultural momentum (Wikipedia pageviews; free, checked live 13 Oct)
  - moments (Ticketmaster tours) [VERIFY key]
  - signal strength (stability and core)
- **Target wording: "most valuable fits"** (14 Oct), not "highest predicted yield".
- **Rank by the combination (14 Oct).** Athena scores each crowd on the strength of all six parameters together and ranks the crowds by that combined score. The ranking must come from real data analysis and math, with Gemini and Qloo supplying awareness of context. It is never a single-parameter sort and never a gut call.
- **A strategy for every most valuable fit, not just one crowd.** Each top-ranked fit gets its own strategy. "Plan for this crowd instead" assumes one plan for one crowd, so it is superseded; its fate goes in the rework plan.
- **Other actions per fit:** the founder will list them later. **Remind them** during the rework plan.


---

#### 2. Athena doesn't know what time of year it is

**In your words (14 Oct):** "We are not time/date aware while searching for and building brand strategy, so we can't offer time/season-specific opportunities that must be important to decide how the brand could leverage different seasons like holiday season, Halloween season, Black Friday etc. and much more. The examples are arbitrary."

**The problem, precisely (checked in the code, 14 Oct):**
1. **The strategy has no calendar.** The prompts behind the brief, the crowds, the stops and the plan are never told today's date, so Gemini guesses "now" from its training data. Nothing in the strategy code knows about seasons, holidays or retail moments.
2. **The only date awareness is local events:**
   - festival dates for a metro;
   - Ticketmaster events in the next 120 days;
   - a "within 30 days" flag on moments.

   None of it is the brand's own calendar.
3. **So the plan is timeless.** It gives the same advice in October as in March and never answers "when?", even though Q4 (gifting, Halloween, Black Friday/Cyber Monday, the holidays) decides much of a consumer brand's year.
4. **Taste moves with the seasons too,** and Qloo's graph isn't seasonal.

**Decided (14 Oct):**
- **All three calendars:**
  - general retail moments (Black Friday, the holidays);
  - the brand's own category seasons (grilling, back to school);
  - the crowds' cultural moments (a show's new season, tour dates).
- **Every horizon that holds a real opportunity, not one fixed window:**
  - now (0–30 days);
  - next quarter (30–90 days);
  - season (3–6 months, with buying lead times) [VERIFY per retailer];
  - the 12-month calendar;
  - recurring patterns ("this crowd peaks every summer").
- **Every prompt and agent run knows today's date.** Each moment carries a checked date and a lead time saying when to start.
- **Seasonality and momentum as evidence:**
  - Wikipedia pageviews: daily views of each crowd's landmark articles since 2015, free with no key. A rising or falling trend shows momentum; years of data show yearly peaks. The limit is that they measure attention, not buying.
  - Google Trends is the better attention signal, but its official API is an application-only alpha (announced July 2025, not generally available) [VERIFY access]. pytrends is unmaintained, and scraping or paid resellers break our zero-spend and terms rules. **Applied for the alpha on 14 Oct** (project `athena-qloo`). If accepted, we use Trends. If not, Wikipedia pageviews do the job.
- **"When" feeds the ranking** of the most valuable fits (problem 1). Each strategy says what to do now, what to do next, and what to do before each moment.
- **Computed live for any brand and any date,** never from a fixed holiday list.

---

#### 3. Onboarding is a static chatbot that makes the founder do the work

**In your words (14 Oct):** the first step "is awfully like a static chatbot with ugly bubbles", and "the onus is on the user to describe in natural language, which is arduous and causes friction".

**The problem, precisely:**
1. **It looks like a chat window:** a blank text box, speech bubbles and one question at a time. It reads like a support bot, not an agent at work.
2. **The founder does the work.** They have to know what Athena needs and type it out in prose. Athena's own research is mostly hidden.
3. **Corrections are slow.** Each one is another round of typing and waiting.
4. **It comes first,** so every founder and judge meets this friction before any of the taste work.
5. **It's problem 0 again:** a fixed question loop, not an agent doing the onboarding.
6. **The website is read thinly.** Gemini's URL context reads only the pages it's handed, with a cap per request. There's no crawl, no structured product data and no catalogue.
7. **Company knowledge can't come in.** There's no way to add decks, PDFs, spreadsheets, images or notes, or what the founder has already told other AI tools.
8. **A self-imposed rule blocks a proper crawl.** "The server never fetches user URLs" was Claude's security default against SSRF in the 9 Oct PRD, not a product requirement.

**What it should be instead:**

**A. The interface: an agentic playground**
- **A small version of the Claude Code interface.** Athena's work streams live as steps you can expand: crawling the site, reading files, searching, Qloo lookups, drafting the brief. There are no chat bubbles.
- **Chat stays as an optional steering box** under the stream ("focus on wholesale", "we're launching a new line in March").
- **Questions look like Claude Code's:**
  - 2–4 options built from Athena's research, with the recommended one first;
  - "Other" for a custom answer;
  - more than one choice allowed where that makes sense.

  There are no open-ended questions.
- **Founder-only questions** (budget, goals, constraints) are optional and take little work. Athena suggests answers from what it found, the founder confirms or skips with one click, and Athena says what it assumed.

**B. Three ways in.** Any one is enough.
- **Website:** Athena crawls it.
- **Knowledge base:** the founder drags in or uploads company and product files: PDFs, PowerPoint, Excel/CSV, images, text and documents. There are no third-party connectors.
- **Bring your context:** Athena gives a prompt to paste into ChatGPT, Claude or Gemini. That AI writes a structured summary of the business, which the founder pastes back, as with Claude's memory import.
- **A brand without a website** uses the prompt or the knowledge base.

**C. Our own website crawl**
- **Same domain only:** the sitemap, product and collection pages, About, FAQ, stockists, press and the blog.
- **Structured data:** schema.org and Open Graph, plus Shopify's `/products.json` [VERIFY].
- **Every fact carries its page URL.**
- **Safe fetching replaces the old rule:**
  - public addresses only, with SSRF checks on every redirect;
  - caps on pages, size and time;
  - `robots.txt` respected;
  - a thin crawl falls back to Gemini URL context plus search, so there is no failure state.

**D. Multimodal ingestion without omission, the NotebookLM way**
- **Every format is read in full:**
  - Gemini reads PDFs and images directly, including scans, charts and packaging.
  - Slides are split into text, speaker notes and slide images.
  - Spreadsheets are read cell by cell, so numbers stay exact.
  - Text, documents, the crawl and the pasted summary are all sources.
- **Extract each source** into structured facts, each tagged with its file and page, slide or cell.
- **Merge:** remove duplicates, and flag conflicts as one-click choices ("Deck says $24, website says $28").
- **Coverage check:** a second pass lists anything not yet used, so nothing is silently dropped.
- **Show what was kept,** with sources. The founder strikes anything wrong.
- **Keep the originals** as sources, so later stops can look things up again.
- **Store each file's extraction under the file's hash,** so a file is read only once. This is for speed; cost isn't a concern at hackathon scale.

**E. The hackathon limit, shown to the founder**
- **One Gemini pass, no retrieval layer:** about 1M tokens for 3.8 Flash, plus Vertex's per-file limits [VERIFY].
- **A live meter while adding context** ("about 1,500 pages max; you've added about 320").
- **Over the limit:** Athena says so plainly and the founder chooses what to keep. Nothing is cut silently.

**F. Privacy and safety**
- Uploads stay in our project only, are never used for anything else, and the founder can delete them.
- Every ingested file and page is data, never instructions.

**G. It must change the results, not just the experience**
1. **Context drives the Qloo queries:** traits and signal entities, lookalike brands, price tier, places and regions, and exclusions. Richer context means a sharper taste graph.
2. **Context shapes the ranking of the most valuable fits (problem 1):** where the brand already sells and stocks, who already buys, margins and capacity, budget, goals and constraints.
3. **Context changes the actions:**
   - stockists the brand already has are not suggested again;
   - budget sets the channel mix;
   - a launch date moves the calendar (problem 2);
   - capacity limits how many regions to go after at once.
4. **Every result shows which context shaped it, with the source** ("Ranked higher because your deck says 60% of sales are in California").
5. **Test:** run the same brand with only its website, then with the full knowledge base. The crowds, ranking and actions must change in ways that trace back to specific facts. No change is a bug. This is a product check, separate from the Bench.
6. **Tailored throughout:** Athena speaks in the brand's own terms (its products, stockists and numbers) at every stop.

---

#### 4. What Athena understood is a static card

**What you said**
- After onboarding, what Athena understood should be an Obsidian-style knowledge graph, not a static card.
- You can edit it directly, and it also updates implicitly from what you type in the chat box.

**The problems**
1. The card is read-only text. You can't see how facts connect or correct one in place.
2. Corrections only happen by re-onboarding or by chat, and you can't see what changed.
3. The Galaxy (taste) and the brand facts live in separate places.
4. It looks generic next to the reference product in `ux-pattern-audit.md`.

**The fix**
- **A. One brand graph:** a strip of key facts plus a graph grown from the Galaxy.
  - Starts with 15–25 nodes; past 12 nodes of one type, they fold into a group.
  - Every edge carries its reason.
  - Every node shows its source: website, a file, Qloo, or you (problem 3 G).
  - Crowd nodes carry their Win first / Win next / Watch tier and the reason (problem 1).
  - Time-sensitive nodes show when they matter: moments, seasons, lead times (problem 2).
  - A list view sits beside it and is the main way to read it.
- **B. Edit facts, never taste.**
  - Add a fact by typing it (Athena resolves it via Qloo or the place resolver).
  - "Remove" only hides a fact. "Wrong" also teaches the agent to stop inferring it.
  - Chat edits go through the existing merge rules: your words beat files, which beat guesses.
  - What changed flashes, with an Undo.
  - No "That's us / Not us" pins (consistent with problem 1).
  - Plays that relied on a changed fact are flagged stale, with a one-click re-run.
- **C. Look and feel (from the audit):** a serif display face for headings, small uppercase labels, 16px-radius cards.

---

#### 5. Features sit behind one fixed path

**What you said**
- Plays should cover all of Athena's features, drop "Prove", and stay open for features added later.

**The problems**
1. Features are reachable only through one fixed journey, so most of them are invisible.
2. "Prove" isn't something a founder would choose to do.
3. Adding a new feature means rewiring the journey.
4. Fixed plays are scripts, not an agent (problem 0).

**The fix**
- **A. The agent suggests goals; the founder picks.** The agent reads the graph and proposes 3–5 goals for this brand right now, styled like Claude Code questions:
  - Pick one or several. Goals that conflict can't be picked together.
  - The recommended goal comes first.
  - "Other" lets the founder write a custom goal.
  - The steering box stays available.
- **B. Plays become the agent's tools.**
  - Seven groups: Taste, Fans, Where, Shelves, Partners, Events, Insights.
  - Each run shows its time, its Qloo calls, and which nodes it adds to the graph.
- **C. "Prove" becomes a quiet "how we know" link on each result:** With / Without, plus the Bench line with Gemini's number.
- **D. Registries:** tools and node types each live in one registry file, so a new feature is one new entry and the agent can use it at once.

---

### 23.2 How we build v5

**Order:** the agent core comes first, because every other problem runs on it (problem 0). Then the inputs (onboarding), then the judgment (ranking and calendar), then the surfaces (the Brand Graph, goals). **From step 3 on, every feature is built as agent tools plus a goal, never as a new fixed stop.** Each step ends with a live run on a brand outside the demo packs. Submission stays 28 Oct.

| # | Problem | Build | Done when |
|---|---|---|---|
| 1 | 2 | **Date in every prompt and agent run.** One `now()` context goes into every Gemini call and every agent goal: today's date, the season, and days to the coming retail moments. | Every trace shows today's date, and the same brand run with a different date gets different timing. |
| 2 | 0 | **The agent core.** (a) **Tools, not a script:** the existing code becomes tools in one registry (`lib/agent/tools.ts`): Qloo search, insights, demographics, build graph, probe, geography, axes; Wikipedia momentum, Ticketmaster, Census, web search, read website. (b) **A goal and a budget** per run (for example "decide who to win first and how; 150 Qloo calls, 60 s"); the agent picks the order. (c) **It reacts to evidence:** the system prompt and tool results let it probe more when a crowd is soft, check the adjacent crowd when momentum fades, and follow the bridges when reach is small. This comes from model context, not hard-coded branches. (d) **Every claim cites a tool call;** code rejects numbers with no source. (e) **The narration is the agent's real steps,** streamed. (f) **It asks the founder only what only the founder knows** (budget, goals, margins, constraints), never taste, through the question component from step 3. (g) **Hard caps** on turns (8–12), Qloo calls and seconds. (h) **Fallback:** if the agent stalls, the current fixed pipeline runs, so there is no failure state. (i) **Bench methods stay deterministic tools, exactly as registered;** the agent chooses among them and never changes how they score. Framework: our own loop on Gemini function calling (default); the Vercel AI SDK is the alternative. | On a brand outside the packs, one goal runs end to end. The trace shows the agent choosing its next tool from evidence, every number has a source, and a forced stall falls back cleanly. |
| 3 | 3 A, B, F | **Onboarding as an agentic playground** (replaces the chat bubbles). (a) The live stream of expandable steps: crawling, reading files, searching, Qloo lookups, drafting the brief. (b) The optional steering box. (c) **One shared question component, styled like Claude Code:** 2–4 options built from research, the recommended one first, Other for a custom answer, multi-select where it fits, and no open-ended questions. Steps 2, 6 and 8 reuse it. (d) Founder-only questions are optional, with suggested answers to confirm or skip in one click, and Athena says what it assumed. (e) **Three ways in, any one enough:** website, knowledge base (uploads only: PDF, PowerPoint, Excel/CSV, images, text, documents; no third-party connectors), and the "bring your context" prompt to paste into ChatGPT, Claude or Gemini and paste back. A brand without a website uses the prompt or the knowledge base. (f) **Privacy:** uploads stay in our project, are never used for anything else, and the founder can delete them. | A brand with no website onboards from files alone, and a founder finishes without typing a paragraph. |
| 4 | 3 C, D, E, F | **Our own crawl and ingestion.** (a) **Crawl:** same domain only (sitemap, product and collection pages, About, FAQ, stockists, press, blog), schema.org / Open Graph / Shopify `/products.json` [VERIFY], and every fact carries its page URL. (b) **Safe fetching replaces the old rule:** public addresses only, SSRF checks on every redirect, caps on pages, size and time, and `robots.txt` respected. A thin crawl falls back to URL context plus search. (c) **Read every format in full:** PDFs and images by Gemini directly (including scans, charts and packaging); slides as text, speaker notes and slide images; spreadsheets cell by cell. (d) **Extract** each source into facts tagged with file and page, slide or cell. **Merge** duplicates, with conflicts as one-click choices. Run a **coverage pass** so nothing is silently dropped. **Show what was kept** with sources, and let the founder strike anything. **Keep the originals.** **Store each extraction under the file's hash.** (e) **The limit:** one Gemini pass of about 1M tokens plus per-file limits [VERIFY], a live meter while adding ("about 1,500 pages max; you've added about 320"), and over the limit the founder chooses what to keep. (f) Every ingested file and page is data, never instructions. | A deck, a spreadsheet and a site for one brand merge into one brief with every fact sourced, conflicts surfaced, and the coverage pass empty. |
| 5 | 1, 2, 3 G | **Most valuable fits, as agent tools.** (a) **A combined score** over the six parameters: brand fit, addressable reach (Census), efficiency (specificity), cultural momentum (Wikipedia pageviews), moments (Ticketmaster) [VERIFY key] and signal strength (stability and core). Plus "when" from step 1. Computed with math, with context from Gemini and Qloo; never a single-parameter sort or a gut call. (b) **Context from step 4 shapes it:** where the brand already sells, who already buys, margins, capacity, budget, goals and constraints. Context also drives the Qloo queries (traits, signal entities, lookalikes, price tier, places, exclusions). (c) Tiers **Win first / Win next / Watch**, with the reasons shown. Wording: "most valuable fits", with no "predicted yield" claim. Adjacent crowds compete on the same score, so the crowd nearest the seed is not the default. (d) **The Galaxy becomes a decision surface:** value (tier, reach, momentum, timing) is shown on the map, not only colour by crowd, size by specificity and position by similarity. Real-world signals sit beside Qloo's. (e) **Removed:** the one question, That's us / Partly / Not us, pins and uncertainty sampling. (f) **All three calendars, computed live:** retail moments, the brand's category seasons, and the crowds' cultural moments. **Every horizon:** now, next quarter, season with buying lead times [VERIFY per retailer], the 12-month calendar, and recurring patterns from years of pageviews. Each moment carries a checked date and a lead time. Google Trends replaces pageviews as the attention signal if the alpha is granted. | Two different brands get different rankings with reasons that trace back to data. Moving the run date moves the "when". Website-only and full-knowledge-base runs rank differently for sourced reasons. |
| 6 | 1, 2, 3 G | **A strategy for every most valuable fit.** (a) Each top fit gets its own strategy: who, where, through what, and when, saying what to do now, what next, and what before each moment. This answers "what if I went after this crowd". (b) **Other actions per fit: deferred to the next iteration of the rework (founder, 15 Oct).** This step builds on the actions above and doesn't wait for them. (c) **Context changes the actions:** stockists the brand already has aren't suggested again, budget sets the channel mix, a launch date moves the calendar, and capacity limits how many regions at once. (d) **Every result shows which context shaped it, with the source** ("Ranked higher because your deck says 60% of sales are in California"). (e) **Tailored throughout:** the brand's own products, stockists and numbers. (f) "Plan for this crowd instead" is removed, because every top fit already has a plan. | Each top fit has its own sourced strategy and actions, and changing one context fact changes the matching action. |
| 7 | 4 | **The Brand Graph** (§13.12). (a) A fact strip plus the graph grown from the Galaxy: one graph, not two. It starts with 15–25 nodes, folds a type into a group past 12, gives every edge its reason, and shows every node's source. Crowd nodes carry tier and reason; time-sensitive nodes show when they matter. (b) A list view beside it is the main way to read it, and the phone layout (**superseded by 7.1:** list and graph are one view). (c) **Edit facts, never taste:** add by typing (resolved through Qloo or the place resolver), "remove" (hides) or "wrong" (also stops the agent inferring it), and no pins. (d) **Chat edits** go through the merge rules (your words beat files, which beat guesses); what changed flashes, with Undo. (e) **Plays that used a changed fact** are flagged stale, with a one-click re-run. (f) **Look and feel from the audit:** a serif display face, small uppercase labels, 16px-radius cards. | An edit in chat and one on the graph each change the right nodes, show what changed, can be undone, and flag the right plays. |
| 7.1 | 4 | **List and graph in one view** (founder, 15 Oct; the immediate next step). (a) The List / Graph toggle goes: the Brand Graph is one view, not an either-or. (b) The graph sits inside the list, after the fact strip and the founder's facts and right before "Brands like you"; every list section below it stays as it is. (c) Edits, the flash, Undo and the stale flags work the same from either part, and the phone layout keeps the same order. | The toggle is gone; the graph shows right above "Brands like you" on desktop and at 375px, and an edit in the graph or the list updates both at once. |
| 7.2 | 3 A, B | **Onboarding as an agentic workspace, not a form** (founder, 15 Oct; after 7.1). Today the first screen reads like a government form: labelled fields, a drop zone, a collapsed section, and an empty Brand Graph full of "Add". (a) **First screen: one box only.** A large, calm composer sits in the middle ("type or paste anything about your brand"), under a short headline, one line and a small mark. The ways in are quiet chips inside the box (files; website; "bring your context from ChatGPT, Claude or Gemini", which copies the prompt in one click) next to a single dark send button. Four quiet cards underneath suggest what to give, and each opens its action. Lots of space, a faint dot-grid canvas, soft grey borders, small icons, and one dark element. No Brand Graph, no labelled fields, and no journey progress bar (Product · How to grow · Crowd): it stays hidden through onboarding, and step 8 replaces it with goals. (b) **The agent sorts the input, not the founder:** a typed or pasted website is read as the site, dropped files go to the knowledge base, and pasted text is read as notes or an AI summary. This is model context, not field rules. (c) **After send, a workspace.** The box glides down and docks at the bottom as the steering box (steer or add files mid-run). The live transcript fills the main area. **The Brand Graph slides in from the right as a side panel** and fills in while Athena works. What Athena kept and the conflicts to settle get their own section or tab within the canvas. **The left side panel is reserved** for Athena and the six specialist agents (step 8 f). On a phone the pieces become tabs (Transcript · Brand · Kept), with the box docked at the bottom. (d) **A live transcript, never a timer:** no "Working · 52 s". Each step narrates in plain sentences what it is doing and what it found ("Opened the About page: founded 2018 in Oakland", "Found a stockist page: Target, Whole Foods and 7 more", "Looked it up in Qloo: found it"), and each line expands to its source. Finished steps fold to one line. (e) **A live checklist of the agent's own plan**, pinned at the top like Claude Code's to-do list: ticked (with a short result), current (matching the transcript) and to come. **The agent writes the plan at the start and updates it**, adding or skipping steps as it learns (problem 0), so the list is never a fixed script. On a phone it is one collapsible line ("Step 3 of 6 · Find you in Qloo"). (f) **Built with the onboarding speed-up** (§23.4 open item 5, methods 1–2): a transcript needs the reading to report page by page and fact by fact, not one long call that answers at the end. | A founder lands on one box, drops a site and a file in it with no fields, and sees the box dock, the checklist and transcript narrate real steps with no timers or long silences, and the Brand Graph fill in from the right, on desktop and at 375px. |
| 8 | 5 | **Goals, not a fixed path: Athena leads six specialist agents** (founder, 15 Oct; replaces the seven play groups in §23.1 problem 5 B: Insights folds into the lead and into every specialist). (a) **Athena, the lead,** reads the Brand Graph and proposes 3–5 goals for the brand right now, through the step 3 question component: pick one or several, with conflicting goals not pickable together, the recommended one first, and Other for a custom goal. The steering box stays. Athena turns the picked goals into work for the specialists and runs two or three at once, within the Qloo rate limit. **Goals belong to the founder; agents are the team behind them**, never one to one: (1) Athena only suggests goals the specialists can deliver; (2) one goal usually takes several specialists ("Launch in Austin": the Navigator, the Rep and the Promoter), and the goal stays on top with its team shown in the left panel; (3) a custom goal under Other that no specialist covers gets the part the team can do, with the rest named plainly ("fundraising itself is outside what Athena does"), never a dead end, an error or a forced fit. Small asks that need no specialist Athena answers herself, since she can use every tool. (b) **Six specialists, each a real agent** with its own instructions, tools, budget and transcript, and the Brand Graph as their shared memory: **The Analyst** (who loves the brand and what else they love: fingerprint, crowds, rivals), **The Scout** (the next crowd worth winning and what to say to it: path, words, mood board), **The Navigator** (which cities and neighbourhoods first), **The Rep** (which shops and retailers to pitch, and the pitch), **The Matchmaker** (brands and podcasts to team up with, both ways, and the ask) and **The Promoter** (events, moments and online audiences, with lead times and the inquiry). Every current feature belongs to one specialist, so it is reachable as a goal, not only through the old journey. Each gets a mission and a "done when", never a fixed order of calls, and decides its next step from evidence (examples: the Analyst seeds from similar brands when the brand isn't in Qloo; the Navigator breaks a close tie on reach and income and sizes the list to the founder's capacity; the Rep widens to the next neighbourhood when venues are few and never suggests a shop that already stocks the brand; the Matchmaker drops a partner whose fans don't like the brand back; the Promoter moves to the next occurrence when the lead time has passed). A specialist can hand work back to Athena ("the Rep needs a city first") and asks the founder only founder-only questions. (c) Each run shows its time, its Qloo calls and the nodes it adds to the graph. (d) **"Prove" goes:** a quiet "how we know" link on each result shows With / Without and the Bench line with Gemini's number. (e) **Registries:** tools (`lib/agent/tools.ts`), node types (`lib/graph/types.ts`) and the specialists are one entry each. Features that are fixed stops today (Markets, neighbourhoods, Places, the retailer step-up, partner brands and podcasts, online audiences, messages, the mood board, the drafts, outcome logging) are wrapped as tools. (f) **The left panel lists Athena and the six specialists** (the space 7.2 reserves), each with live status: idle, working (with its current step) or done (with its last result). Clicking one opens its workspace. A specialist waiting on another's result is greyed out with the reason, never hidden. On a phone the list is a menu. (g) **Insights live in every specialist and in Athena:** the founder marks each result (pitched, yes, no, no reply); the specialist reads those outcomes before deciding again ("three cafés said no, two bottle shops said yes") and shows what Qloo changed in its answer. Athena keeps what crosses agents: which results a new outcome or graph edit makes stale (and re-runs them), patterns across agents ("your crowd responds at events, not on shelves"), and one "What's working" overview. (h) **The true-agent test:** two different brands take visibly different paths through each specialist, and the trace says why; and a planted surprise (a weak crowd, an empty city, a one-way partner) makes the specialist change course. A specialist that can't pass both is folded into another. | A founder picks a goal, sees Athena hand it to the right specialists in the left panel, and gets results that cite their tool calls; two brands take different paths; the surprise test changes course; a marked outcome changes the next run; and a new play added as one registry entry is used by its specialist with no other change. |
| 9 | 3 G | **The context test:** the same brand with only its website, then with the full knowledge base. The crowds, ranking and actions must change in ways that trace back to specific facts. A product check, separate from the Bench. | The diff is written up per brand; no change is treated as a bug. |
| 10 | all | QA against the no-failure-state rules, the phone layout, the Cloud Run deploy, re-warming the demo packs, and the write-up and video. The write-up says plainly that Athena is now an agent (problem 0), for Stage 1 judging. | Rehearsed twice end to end, and the coverage table (§23.3) is all ticked. |

### 23.3 Coverage: every problem point and where it's built

| Problem | Point | Step |
|---|---|---|
| 0 | 1–4. Code decides every step; Gemini has no Qloo tools; narrow single prompts; the engine follows a fixed algorithm | 2 (tools, goal, loop), then 3–8 are built on it |
| 0 | 5. Judging: "functions as an agentic tool" | 2, 10 |
| 0 | Tools; goal and budget; reacts to evidence; cites tool calls; real narration; asks only founder-only questions | 2 a–f |
| 0 | Hard caps; fallback; Bench methods stay deterministic | 2 g–i |
| 0 | Framework | 2 (default), open item 3 |
| 1 | 1, 4. Shows the instrument, not value | 5 d |
| 1 | 2. The founder as the oracle (question, pins, reactions, uncertainty sampling) | 5 e, 7 c |
| 1 | 3, 5. Similar is not the same as valuable; the default is the nearest crowd | 5 a, c |
| 1 | 6. A closed world | 5 a, d, f |
| 1 | 7. Interactions don't answer "what if" | 6 a |
| 1 | Headline and tiers; "most valuable fits"; no yield claim; combined score | 5 a, c |
| 1 | A strategy for every fit; "Plan for this crowd instead" goes | 6 a, f |
| 1 | Other actions per fit | Deferred to the next rework iteration (6 b, open item 1) |
| 2 | 1. No date in prompts | 1 |
| 2 | 2–3. Only local event dates; a timeless plan | 5 f, 6 a |
| 2 | 4. Taste moves with the seasons | 5 f (pageviews, recurring patterns) |
| 2 | Three calendars; every horizon; checked dates and lead times; Trends or pageviews; "when" in the ranking; live, no fixed list | 1, 5 a, f |
| 3 | 1–5. Chat window; founder does the work; slow corrections; comes first; a fixed loop | 3 a–d, on step 2 |
| 3 | 6, 8. Thin website reading; the URL rule | 4 a, b |
| 3 | 7. No company knowledge | 3 e, 4 c–d |
| 3 | A. Playground, steering box, Claude Code questions, founder-only questions | 3 a–d |
| 3 | B. Three ways in; no website | 3 e |
| 3 | C. The crawl and safe fetching | 4 a, b |
| 3 | D. Ingestion without omission | 4 c, d |
| 3 | E. The limit and meter | 4 e, open item 4 |
| 3 | F. Privacy; data, not instructions | 3 f, 4 f |
| 3 | G1–2. Context drives Qloo queries and the ranking | 5 b |
| 3 | G3–4, 6. Context changes actions; sources shown; tailored | 6 c–e |
| 3 | G5. The website-only vs full-knowledge-base test | 9 |
| 4 | 1–3. A read-only card; invisible corrections; Galaxy and facts apart | 7 a, c, d |
| 4 | 4. Generic look | 7 f |
| 4 | A–C. Graph, edits, look and feel | 7 a–f |
| 5 | 1. Features hidden behind one journey | 8 b |
| 5 | 2. "Prove" | 8 d |
| 5 | 3. Adding a feature means rewiring | 8 e |
| 5 | 4. Fixed plays are scripts | 8 a, on step 2 |
| 5 | A–D. Goals, plays as tools, how we know, registries | 8 a–e |
| 5 | Lead and six specialist agents; left panel; insights in every agent; true-agent test (founder, 15 Oct) | 8 a, b, f–h |

### 23.4 Rules and open items

**Rules that hold through the build**
- No failure states; nothing hangs; slow calls are narrated; Qloo copy stays understated.
- Everything works live for any brand; demo caches are only a speed-up.
- Understanding bugs are fixed with model context, never keyword rules.
- No Qloo data in the repo; secrets only in `.env`; zero spend beyond the $300 credit; claims checked and marked [VERIFY].
- **Bench integrity:** prereg-v2 held-out brands are never re-run or retuned; we never claim Athena or Qloo ranks stockists better than an LLM; every Bench line carries Gemini's number; any method change after the tag is disclosed.

**Open before or during the build**
1. **Other actions per most valuable fit** (problem 1): deferred to the next iteration of the rework (founder, 15 Oct); remind them once this rework is done.
2. **Google Trends alpha** (applied 14 Oct): use it if granted; otherwise Wikipedia pageviews.
3. **Agent framework:** own loop on Gemini function calling (default) vs the Vercel AI SDK; Google ADK TypeScript support [VERIFY].
4. **The 1M-token and per-file limits** for Gemini 3.8 Flash on Vertex [VERIFY] before the meter ships.
5. **Onboarding speed-up** (problem 3; deferred by the founder, 15 Oct, to be built later; methods 1–2 are built with step 7.2, whose live transcript needs them). *Measured 15 Oct:*
   - **Olipop, from its website alone:** 3.6 min end to end. The site read took about 2.5 min, and one web search timed out.
   - **A parked domain (ghia.com):** 104 s. The site read took 34 s, the agent about 67 s over five turns of 3–15 s each, and one web search 17 s.

   **Cause:** one call waits on the next:
   1. crawl;
   2. one large Flash extraction (up to 24k output tokens), plus coverage rounds that each re-read the whole site;
   3. a Flash comparison at medium thinking;
   4. the agent (Qloo search, web search);
   5. the source check.

   Most of the time goes to the model writing output, and Flash was unusually slow that day (7–60 s on calls that are normally a few seconds).

   **Methods, biggest win first:**
   1. **Answer first, finish later.** Read the home and About pages with Flash-Lite and fill the core brief (name, what it sells, price, channel, tier) in about 20 s. The full read keeps adding facts in the background while the founder moves on; the brief and graph update in place with a note, never a spinner.
   2. **Run independent work at once.** The Qloo lookup and the web search start alongside the site read, not after it. The site is read page by page in parallel, not in one huge call.
   3. **The cheapest model that does the job.** Flash-Lite picks out facts; Flash only compares facts and writes the brief, where judgment matters. The same switch took chat edits from 20 s timeouts to about 1.5 s (step 7).
   4. **Write less.** Fewer coverage rounds (stop after one that adds little), shorter fact text, and lower output caps.
   5. **Cut off slow calls.** Each call gets a short time limit, and a second identical request goes out if the first is slow (as chat edits do). A web search that hangs is cut off within seconds and the run carries on without it.
   6. **Start before the click.** The crawl begins once a valid website is typed, before Start. Reads are already kept for 6 hours, so a re-run is instant.

   **Target:** a usable brief in about 20 s, and the full fact list within about a minute [VERIFY: measure live before claiming].

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
