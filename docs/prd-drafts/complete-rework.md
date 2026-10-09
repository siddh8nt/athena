# Draft PRD change: the complete rework (v3.0)

Status: **applied to `ATHENA PRD.md` as v3.0 on 10 Oct**, with the responsible-use changes agreed afterwards (creators as partners; ad interests and a clear skew suggested as audiences to test; sensitive types still banned). The PRD is the source of truth; this file is kept for history. Branch: `complete-rework`.

Sections touched: version table, §1, §2.1–2.4, §2.3 (moments), §6 (flows), §7.1 and §7.6 (growth types over motions), §7.7 (demos), F1–F3, F5, F6, F31, new F40–F46, new §9.23 (taste graph and crowds), new §9.24 (Online), §11.1 (limits, new rows Q21–Q23), §12 (pacing), §13 (journey and dashboard), §14.9 (Qloo pacer).

What it replaces: the brief chat built on `complete-rework` on 9 Oct (agent chat, streaming, taste card) is not committed and is replaced by this design. Its useful parts (streamed replies, the activity trail, Flash-Lite with hedging, the research cache, product → proxy brands) carry over as implementation, not as spec.

Markers: **[DECISION]** = a default I set, yours to change. **[VERIFY]** = not yet confirmed live. **Verified 10 Oct** = checked live with our key.

---

## Version table row

| New in v3.0 | **The taste model is the centrepiece, and the whole product is a journey.** (1) **Intake asks about the product, not the customer** (§6.2): what it is, price, what it's made of, how it looks, when it's used, where it's sold. Athena turns those traits into Qloo signal itself. (2) **Online or offline** is asked (with Athena's guess) and shapes the options. (3) **Growth types replace motions as the founder's choice** (§7.1): Deepen, New city, New crowd, Borrow a crowd, Show up, Online, Own location; up to 3. (4) **A taste graph built from Qloo affinities splits the brand's crowd into 2–3 crowds** (§9.23), each with its own cities, loves, partners and audience skew. (5) **City is no longer a required input:** it's an output of the crowd, asked only when a growth type needs it. (6) **The plan is a step-by-step journey** (§13): each stop is a decision with options, waits for the founder, and carries choices forward. (7) **The dashboard is the advanced view** and where the pipeline is worked. (8) **Demos become context packs**: ready-made material for fictional brands that judges drop in and watch run live. (9) **Qloo's limits are measured** (10 Oct): 5 calls a second and 10,000 a month on our key; one shared pacer holds 5 a second (§14.9). |

---

## §1 Summary (changes only)

**One line (replaces).** A founder describes their product and picks how they want to grow. Athena reads the product into Qloo's taste graph, finds the crowds who'd love it, and walks the founder through a growth plan one decision at a time: which crowd, where they are, which places, who to partner with, what to say, when to show up. Every pick carries Qloo evidence, and the plan re-ranks from the founder's wins and declines.

**Insight (adds a second paragraph).** *A product's traits and the brands it resembles are a key into the taste graph.* A founder doesn't know what their customers listen to; Athena works it out. Product traits become Qloo tags and lookalike brands; Qloo's cross-domain affinities expand them into a graph of what that crowd loves; the graph splits into distinct crowds the founder can choose between.

**Why only Qloo (adds item 7).** 7. split a brand's customers into distinct crowds from real cross-domain affinities, and say where each one lives and what it loves. An LLM can only guess at personas; here each crowd is a cluster of real Qloo entities with real affinity scores.

**One job, six blocks → one journey.** The six blocks stay as the engine. What changes is how they're shown: as stops on a journey, chosen by the founder's growth types (§7.1), not as tabs ordered by a recipe.

---

## §2 The demo (changes)

### 2.1 Principles (edits)

- **1. Live on arrival → Live from the first message.** No signup. The judge picks a context pack (or brings their own brand) and watches it run live. Cached Qloo responses make repeats fast (§14.9).
- **3. We guide; we never drive** stays. The journey itself is the guide; the "Try this" card is removed (F2).
- **9. One screen → One journey, one dashboard.** Versatility comes from the founder's growth types choosing the stops, never from a screen built for one business.

### 2.2 The way in (replaces the demo-brand parts)

- `/start`: **Try your own brand** (primary), and below it **Or try a sample brand**: one card per context pack (§7.7), each saying what's in it ("deck · stockist sheet · 4 product photos").
- Picking a pack opens the journey with the pack's files already attached to the first message, and the judge presses send. Everything after that runs live.
- The real-brand demo workspaces (Brightland, Timeleft, Master & Dynamic) and the brand switcher are removed. **[DECISION]** The landing page's computed comparison line needs a reference run: it uses the hero pack's Places stop.

### 2.3 Key moments (replaces M1–M10)

| # | Moment | What the founder or judge does | What happens | Why it wins |
|---|---|---|---|---|
| J1 | **Tell me about your product** | Describes the product, drops in a deck or photos, or picks a context pack | Athena reads it all, asks at most one question at a time, and fills a live "What I understood" card | It asks what founders know, never what they don't |
| J2 | **Online or offline, and how to grow** | Confirms Athena's guess (one tap), picks up to 3 growth types | The options reorder for the channel; Athena pre-selects 1–2 with a reason | The founder states the goal; Athena does the rest |
| J3 | **Your crowds** | Reads 2–3 crowd cards, answers "That's us", "Not us" or "Partly", picks one | Each card: a name from its Qloo entities and tags, what it loves across brands, music, TV and places, its audience skew, where it concentrates | The part no LLM can do: real crowds from a real taste graph |
| J4 | **Where** | Picks a city, or "what if Austin?" | Cities ranked for that crowd, heatmap and neighbourhoods | Qloo ranks cities by a crowd's taste |
| J5 | **Places, Partners, Online, Message, Moments** | At each stop, shortlists, filters, asks "more like this" | Each stop streams in, ranked for the chosen crowd and city | Every pick carries evidence |
| J6 | **Without Qloo** | Flips the toggle on Places | Same as today's M3 (§10.2) | The challenge's comparison, on the judge's click |
| J7 | **Go → the dashboard** | Reviews the plan, drafts outreach, marks wins and declines | The dashboard opens with everything chosen; re-rank runs on outcomes | A complete job and a loop that learns |

### 2.4 The "Try this" card

Removed. **[DECISION]** A first-time judge is guided by the journey itself and by the sample-brand cards.

---

## §6 Flows

### 6.1 Core loop (replaces)

**Product → Channel and growth types → Crowd → (stops chosen by the growth types) → Go → Dashboard: Act → Record → Re-rank.** Every stop waits for the founder's choice. Every choice carries forward. No outbound action happens without the founder.

### 6.2 Try your own brand (replaces §6.2.1 and §6.2.2)

#### 6.2.1 Chapter 1: your product

1. **The conversation.** Athena opens: *"Tell me about your product. Even just the name works. Drop in anything you have: a deck, photos, a stockist list, your website."* Text is required; attachments are optional (same file types as v2.13, §9.22).
2. **What Athena asks about: the product.** One question at a time, only for what it couldn't find in the files, website or web research:
   - what it is and what makes it different;
   - price point;
   - what it's made of (ingredients, materials) and how it looks and feels (design, packaging);
   - when and why people use it (the occasion);
   - where it's sold today.
   
   Athena **never** asks the founder about their customers' tastes (what they listen to, which brands they love). Working that out is Athena's job (§9.23).
3. **Online or offline.** Athena guesses from the website and the conversation (a shop page → online; a stockists page → offline) and asks for one tap: **Mostly online · Mostly offline · Both**.
4. **Growth types** (§7.1): up to 3, shown as cards ordered for the channel, with 1–2 pre-selected by Athena and a one-line reason each.
5. **Required before the journey moves on** (replaces the four required facts):

   | Required | Why |
   |---|---|
   | Brand name | Qloo lookup, drafts |
   | What it sells, with enough product detail to read into Qloo (§9.23 step 1) | The taste signal |
   | Online, offline or both | Which growth types are suggested and what a city means |
   | 1–3 growth types | Which stops the journey has |

   **City is no longer required.** It's asked at the Where stop, and only when a chosen growth type needs it (§7.1).
6. Kept from v2.13: each question has **"Not sure, make your best guess"** (the answer is labelled **Agent · guessed**); at most 4 follow-up turns; a question is never asked twice; out-of-scope businesses get the one-line reason.
7. **The inline questions during the run (v2.13 §6.2.2) are removed.** Their jobs move into stops: "Is this you?" into Chapter 1 when Qloo returns several matches; "Where are you sold?" into the Places stop for Deepen; "Swap comparable brands?" into the Crowd stop.

#### 6.2.2 Chapters 2 onward: the journey

1. **Step by step** **[DECISION, agreed 10 Oct]:** each stop waits for the founder's choice before the next one starts.
2. **Stops are chosen by the growth types** (§7.6). Shared stops appear once; the first growth type leads.
3. **Each stop is a decision, not a block to read:** it opens with Athena's streamed one-paragraph take, a recommended choice, and options to explore (§13.2).
4. **Choices carry forward.** Changing an earlier stop re-ranks the later ones it affects, with a one-line "what moved and why" note. **[DECISION]** Stops already visited re-run automatically; nothing the founder pinned is dropped without saying so.
5. **Talk to it anywhere** (absorbs F31): "drop gyms", "where after Chicago?" becomes a change to the right stop.
6. **Go** ends the journey and opens the dashboard (§13.3).
7. Kept: Without Qloo on Places (§9.9), capped (§14.5); the trace; the pipeline kept for 7 days in an anonymous session, with the brief.

### 6.3 Signal by stage (edit)

Adds a row: **product only (no brand in Qloo, no accounts):** product tags plus lookalike brands, each found in Qloo (§9.23 step 1). The crowd chosen at the Crowd stop then becomes the signal for every later stop.

---

## §7 Internal playbooks

### 7.1 Growth types (new; replaces motions as the founder-facing choice)

The founder picks **up to 3** growth types. Motions (§7.6) stay inside the code: each growth type maps onto motions and blocks.

| Growth type | The founder's question | Who it targets | Stops it adds | Internal motions | Suggested for |
|---|---|---|---|---|---|
| **Deepen** (shown as "Get into stores" for online brands) | "Get into more places in my city" | Current crowd | Where (home city), Places (stockists) | venue, retail | Offline ⭐ |
| **New city** | "Where should I expand next?" | Current crowd | Where (ranked cities), Places (event or launch venues) | city_launch | Offline ⭐ |
| **New crowd** | "Who else would love this?" | An adjacent crowd (§9.23) | Crowd (pick the adjacent one), Message | partnership + the crowd's own blocks | All |
| **Borrow a crowd** | "Who should I collab with?" | A partner's crowd | Partners | partnership | Online ⭐ |
| **Show up** | "Which events and moments?" | Current or new crowd | Moments | (blocks only) | All |
| **Online** | "Who do I target online, and with what?" | Current or new crowd | Online (§9.24), Message | new: online | Online ⭐ |
| **Own location** (Beta) | "Where do I open a store?" | Current crowd | Where (cities, then neighbourhoods), Places (complementary neighbours) | location_opening | — |

**Rules:**
- **The channel answer orders the cards and sets the ⭐ suggestions. Nothing is hidden.** An online brand can pick "Get into stores".
- **For online brands, a city means where to focus ads and pop-ups**, and Places shows pop-up and event venues, not stockists.
- **Prerequisites** grey an option out with the reason: Deepen needs a home presence (stockists or a home city), Own location needs a physical product or service.
- **Combinations that need one decision:** Deepen + New city → "Which city comes first?"; New crowd + another type → for each other type, current crowd or the new one ("Collab to reach the new crowd").
- **More than 3:** Athena says in plain words that the plan would spread too thin for a young brand; it doesn't block.
- **The founder can change their growth types at any time**; the journey re-routes and keeps decisions already made.

### 7.6 Recipes (edit)

The recipe table stays as the internal mapping from motions to blocks, draft kinds and pipeline stages. The founder never sees it. **Adds R5 Online**: Crowd → Online → Message → Partners (creators, podcasts) → Moments → Act; drafts: collab inquiry, sponsorship inquiry; stages: Target → Contacted → In talks → Live → Renewed, or Declined.

### 7.7 Demo brands → context packs (replaces)

- **Three packs**, prepared separately (not part of this change) **[agreed 10 Oct]**:
  1. a brand Qloo knows;
  2. a young brand Qloo doesn't know (runs on product tags and lookalike brands);
  3. a messy one (for example a phone screenshot of a store list).
- **Fictional brands** **[agreed 10 Oct]**, so no real company's documents are faked. Their stockists and lookalike brands are real places and brands, so Qloo has real data.
- Each pack: a one-paragraph description, a short deck (PDF or PPTX), a stockist sheet or screenshot, 3–4 product photos, and a website (**[DECISION]** a page we host, or no website).
- The pack runs live. Qloo responses are cached as a speed-up only (§14.9), never as finished answers.
- Disclaimer on each pack: "Sample brand made up for this demo."

---

## §8 Functional requirements (changes)

| ID | Change |
|---|---|
| F1 | `/start` shows Try your own brand and the sample-brand packs; the brand switcher and the real-brand demo workspaces are removed |
| F2 | **Removed** (the "Try this" card) |
| F3 | Rewritten: the product-first conversation (§6.2.1). Done when: a product described in one sentence plus up to 2 answers reaches the growth-type step; a pack's deck yields the right category and price tier for ≥ 8 of 10 test packs; Athena never asks about customers' tastes (prompt test over 20 conversations); no question is asked twice |
| F5 | The "How I read your business" card becomes the first card on the canvas, filled live during Chapter 1 |
| F6 | Rewritten: growth types → stops through one `PlaybookConfig`. Done when: three different growth-type picks give three different journeys with no screen built for one pick |
| F31 | Absorbed into the journey: any stop accepts a typed change |
| **F40** | **Online or offline** step with Athena's guess and one-tap confirm. Done when: the guess is right for ≥ 8 of 10 test brands with websites |
| **F41** | **Growth types**: up to 3, prerequisites, conflict questions, channel-based ordering (§7.1). Done when: each rule in §7.1 has a unit test |
| **F42** | **Taste graph and crowds** (§9.23). Done when: Liquid Death and one product-only brand each give 2–3 crowds whose top entities differ (≤ 30% overlap between any two crowds' top 10); every crowd name uses only words from its Qloo entities and tags (validator); the graph uses ≤ 40 Qloo calls |
| **F43** | **The journey** (§13.2): step by step, a progress rail, back and forward, choices carried forward with a "what moved" note. Done when: changing the crowd re-ranks every later stop; no stop starts before the founder chooses |
| **F44** | **The dashboard** (§13.3): the whole plan on one screen, sharing state with the journey; the pipeline is worked here. Done when: a change in either view shows in the other |
| **F45** | **Online stop** (§9.24). Done when: an online brand gets ≥ 5 creators or podcasts and ≥ 6 ad-interest audiences, each with evidence |
| **F46** | **Qloo pacer** (§14.9): never more than the key's per-second limit. Done when: a 40-call burst returns no 429s |

---

## §9.23 Taste graph and crowds (new)

**Why:** the founder knows their product; Qloo knows who loves what. This turns one into the other, and splits the result into crowds the founder can choose between.

1. **Product → seed signal.** The agent turns product traits into:
   - **Qloo tags**, chosen only from what `/v2/tags?filter.query=` returns for each trait (it never invents a tag URN);
   - **3–5 lookalike brands** (similar tier and lifestyle, not direct competitors), each found in Qloo with `/search`; only found ones are kept;
   - **the brand itself**, if Qloo knows it (confirmed with "Is this you?" when ambiguous).

   *Verified 10 Oct:* vegan + skincare + minimalist tags as the only signal returned Cap Beauty, Organic Basics, Juice Press, Good Catch. "Clean beauty" matched only salon categories, so free phrases must go through tag search. (8 Oct found a theme tag alone too generic for **venues**; seeds are used for brands and entities, and venues come later from the chosen crowd.)
2. **Expand.** From the seed, one Insights call per domain (brand, artist, TV, film, podcast, place) gives the first ring with affinity scores. The strongest few entities of the first ring are used as signals for a second ring. **Budget: ≤ 40 calls [DECISION; tune]**, cached per brand for 7 days.
   - *Verified 10 Oct:* every Insights result carries a numeric `query.affinity` (Liquid Death → Dr. Squatch 0.869; → POORSTACY 0.939), and edges cross domains (POORSTACY → Lyrical Lemonade 0.975, Golf Wang 0.967).
   - Scores within one list are tightly packed (top 8 brands: 0.849–0.869), so each list is normalized (rank-scaled to 0–1) before use.
3. **Taste vectors.** Each entity is described by its normalized affinities to the second-ring signals plus its tags. No model training.
4. **Crowds.** Community detection (Louvain) on the graph, or k-means on the vectors **[DECISION: Louvain first]**, gives **2–3 crowds**. A crowd needs ≥ 8 entities across ≥ 2 domains, or it merges into its nearest neighbour.
5. **Each crowd gets:**
   - a **name** written by the agent from only its entities and tags (validator: every word maps to an entity or tag; otherwise "Crowd A");
   - its **top loves** across domains, with affinity;
   - its **audience skew** from `urn:demographics` with the crowd's top entities as the signal, labelled as in §9.17 (*verified 10 Oct*: Liquid Death skews male +0.43, 45–54 +0.33);
   - **where it concentrates**: metros by the place-diversify method (§9.3).
6. **Main and adjacent.** The crowd closest to the seed is the **main crowd**. The others are **adjacent crowds**, which power New crowd.
7. **The founder's reaction refines it, by weighting.** The signal is sent as weighted entities (`POST /v2/insights`, `signal.interests.entities: [{id, weight}]`). "That's us" raises that crowd's weight, "Partly" leaves it, "Not us" drops it to zero and moves its entities to `filter.exclude.entities`. Starting weights **[DECISION; tune]**: That's us 3, Partly 1.5, the rest 1.
   - *Verified 10 Oct* (Liquid Death + Glossier as the signal, top 10 brands): equal weights matched the plain GET exactly (10 of 10). Liquid Death at 1.5× → 2 of 10 from its own list; 2× → 2; 3× → 5; 5× → 7; 20× → 9. **The shift is gradual**, so weights can nudge a plan without flipping it.
   - The GET form `signal.interests.entities.weight` (one number) isn't used; per-entity weights need the POST body with `id` keys (`entity` keys return HTTP 400).

## §9.24 Online (new)

For online brands and the Online growth type. Uses the chosen crowd as the signal.
- **Ad interests:** Qloo audiences (Q20) and tags, labelled as in §9.17, as targeting ideas.
- **Creators and podcasts:** podcasts as in §9.6, plus **creators from Qloo person entities** (`urn:entity:person`), with these rules:
  - `filter.popularity.max=0.9`, so stars are left out;
  - a person is shown as a creator only if their Qloo tags show it: influencer, chef, cookbook writer, podcaster, food stylist, model, musician and the like;
  - US-relevant only: drop people whose tags tie them to other countries;
  - at most 5, each with its affinity, and labelled **Qloo**; contact details are not invented: a link out to search for the person.
  - *Verified 10 Oct:* person results are **strong for niche brands, noisy for broad ones.**
    - Brightland → Alison Roman, Julia Turshen, Molly Yeh, Samin Nosrat, Yossy Arefi: exactly the cookbook and food creators that brand would work with.
    - Glossier → Devon Lee Carlson (tagged Influencer), Doniella Davy (make-up artist).
    - Liquid Death → mostly noise: an American football player, a Thai executive, Indian TV actresses, a bodyguard.
  - The tag rules above are what make it usable. If fewer than 3 creators pass them, the stop shows podcasts only and says nothing about creators.
- **Content:** references and hooks from Message (§9.15), angled for social.
- **Where to focus ads and pop-ups:** the crowd's top metros.

---

## §11.1 Qloo (additions)

**Limits on our key (verified 10 Oct, from the response headers):**
- **5 calls per second** (`x-second-ratelimit-limit`). A burst of 40 calls at 10 in flight returned 27 × 429.
- **10,000 calls per month** (`x-month-ratelimit-limit`); 8,462 were left on 10 Oct, resetting in about 28 days.
- More headroom is being asked for separately (Discord `#api-help`, and the second teammate's key). Not part of this change.

**New rows:**

| # | Capability | Endpoint and key parameters | Used in | Result |
|---|---|---|---|---|
| Q21 | Affinity scores | `/v2/insights`, any entity type: `query.affinity` per result | Taste graph | ✅ 10 Oct |
| Q22 | Tags as a starting signal | `/v2/tags?filter.query=<trait>` → `signal.interests.tags` | Taste graph step 1 | ✅ 10 Oct (brands); generic for venues (8 Oct) |
| Q23 | Crowd skew | `urn:demographics` with a crowd's entities as the signal | Crowd cards | ✅ 10 Oct (brand as signal; crowd sets [VERIFY]) |
| Q24 | Weighted signals | `POST /v2/insights`, `signal.interests.entities: [{id, weight}]` | Crowd reactions | ✅ 10 Oct: gradual shift (3× → 5 of 10 results from the heavier brand) |
| Q25 | People as creators | `urn:entity:person`, `filter.popularity.max=0.9`, tag rules (§9.24) | Online | ⚠️ 10 Oct: strong for niche brands (Brightland → Alison Roman, Samin Nosrat), noisy for broad ones (Liquid Death) |

**Budget per plan (replaces):** taste graph ≤ 40, plus ≤ 30 across the stops a founder visits. At most 70 for any plan.

---

## §12 Agent design (changes)

- **Shape:** one conversational agent across the journey. At each stop it writes a short streamed take, a recommendation and the options, from the stop's Qloo results.
- **Models:** Flash-Lite (`gemini-3.1-flash-lite`) for the conversation's first reply, streamed and hedged (a duplicate request after 2.5 s with no text; the first to stream wins); Flash for the product read and crowd naming. **[VERIFY]** Flash-Lite as the model name in §12.8.
- **Web research** stays in the background (grounded Search, cached per brand for 7 days) and never blocks a stop.

---

## §13 Screens and UX (replaces §13.1–13.2 for the plan; adds §13.3)

### 13.1 Layout

- **Left: the conversation.** Athena's messages, the founder's replies, and each stop's prompt and choices.
- **Right: the canvas.** Each stop lands as a card as it completes; the canvas is the plan being assembled.
- **Top: the progress rail.** The stops for this founder's growth types (for example *Product · Crowd · Where · Places · Partners · Message · Go*), done ones ticked, any one clickable.
- **Phones:** the conversation full width; the canvas as a bottom sheet; the rail as a step counter.

### 13.2 The stops

Each stop: Athena's take (streamed) → the recommended choice → options to explore → **Continue**. Every stop shows "Built from n Qloo calls" and "Show me why" (opens the trace).

| Stop | The choice | Options to explore |
|---|---|---|
| Product | Looks right / Edit | The "What I understood" card, every field with its source |
| Channel and growth | Online/offline; 1–3 growth types | Why Athena suggested each one |
| Crowd | Which crowd (for New crowd: which adjacent one) | Open a crowd: loves by domain, skew, cities; compare two side by side |
| Where | Starting city | Heatmap, neighbourhoods; "what if [city]"; any US city **[depends on the cities rework]** |
| Places | Shortlist | Filter by type; venue drawer; field-day route |
| Partners | Shortlist | Brands, podcasts; mutual fit; "more like this one" |
| Online | Shortlist | Ad interests, creators and podcasts, content angles |
| Message | The angle | Regenerate in another tone; see it per crowd |
| Moments | Add to calendar | Filter by month or city |
| Go | Open the dashboard | Export the one-page brief |

**Without Qloo** stays on Places only **[DECISION]**: v2.11's reason still holds (other stops have no outside check). "Show me why" is on every stop.

### 13.3 The dashboard (new; the advanced view)

- The whole plan on one screen: crowd, map, shortlists, message, calendar, pipeline.
- **Same state as the journey:** a change in either shows in the other.
- **Where the pipeline is worked:** stages, drafts, wins and declines, re-rank (F17–F19). Returning founders land here.
- **Comparing two crowds** side by side lives here, not in the journey.
- Opened from **Go**, or from **View full plan** at any stop.

### 13.5 Motion (adds)

- Each stop's card rises into the canvas; the rail ticks.
- A re-route (a changed earlier choice) shows a 400 ms re-rank on the affected cards with the "what moved" note.

---

## §14.9 Pacing (adds)

- **One Qloo pacer for the whole server**, shared by every visitor: never more than the key's per-second limit (5 today), replacing retries on 429 as the main defence. The client's `MAX_IN_FLIGHT = 6` is lowered to match.
- **Priority queue:** calls whose results the founder will see first go first, so each stop's first results land within about a second and the rest stream in.
- **Reading time is used:** while the founder reads a stop, the pacer's idle capacity prepares the likely next choice (for example the top crowd's cities). **Capped at 5 background calls per stop** **[DECISION]**. It never moves ahead or decides anything.
- **The taste graph starts as soon as the product is clear**, during the channel and growth-type questions, so the Crowd stop is mostly ready when the founder gets there.
- **Several visitors at once share the 5 a second.** Repeat brands and packs are served from cache. This is the main argument for more headroom (§11.1).

---

## Open items this draft doesn't settle

1. The context packs' content (separate work).
2. Whether the cities rework (any US city) lands before or with this.
3. Without Qloo beyond Places: kept to Places unless you want a different comparison for Crowd.
