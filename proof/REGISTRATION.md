# Pre-registration: the Taste Bench and the ranking check (prereg-v2)

DRAFT, not yet registered. Registration is the commit that holds this file, tagged `prereg-v2`, before any Bench call on a held-out brand (PRD §10.3, §10.6). Every result is published, whatever it shows: the per-brand files, the summary, and this file stay in the repo.

The code that runs the Bench is part of the registration: `lib/bench/` (arms, metrics, ground truth), `tests/live/bench.live.ts` (the runner) and the Athena code they call, all at the tagged commit. Where this file and the code differ, the code is what ran, and the difference is reported.

## 1. Question

Does Athena beat an LLM alone at three decisions a founder makes, judged against real-world outcomes? And how much of that comes from Qloo itself versus Athena's methods?

## 2. Brands

| Set | Brands |
|---|---|
| Tuning (published as tuning data, `proof/bench/tuning/`) | Brightland, Fishwife |
| Held out (`proof/bench/results/`) | McClure's Pickles, Rishi Tea & Botanicals, Paddywax, Raaka Chocolate, Dick Taylor Craft Chocolate, Diaspora Co., Juniper Ridge, MUD\WTR |

The runner refuses a held-out brand unless the `prereg-v2` tag exists. A brand without enough ground truth for a task is reported as ineligible for that task (§6), never swapped.

## 3. Ground truth

`proof/stockists/<brand>.csv`: each brand's public store locator, collected on 8 Oct 2026, one row per stockist inside the 25 largest US metros (see `proof/stockists/README.md`). Public business data, not Qloo data.

**Chain review (hand review, fixed here).** A row is a chain when the file's `is_chain` flag is "yes" (a list of about 200 known chains, or a name that appears 3 or more times in the brand's file), or when its venue name begins with the name or an alias of any retailer on the Next retailers lists (§5.2), after normalising (lower case, punctuation removed). Aliases: Whole Foods Market → "whole foods"; Sprouts Farmers Market → "sprouts"; The Fresh Market → "fresh market"; Trader Joe's → "trader joes"; Gelson's → "gelsons"; New Seasons Market → "new seasons"; H-E-B → "heb"; H Mart → "hmart"; Ulta Beauty → "ulta"; Credo Beauty → "credo"; Bloomingdale's → "bloomingdales"; Saks Fifth Avenue → "saks"; Foxtrot → "foxtrot market". Every other row is independent. (Code: `lib/bench/truth.ts`.)

## 4. Conditions

- **Cold start (the headline).** The brand's name is withheld. Each brand has a registered product description (§10) with no brand name, no US place and nothing about where it is sold. Athena's brief agent and business classifier read it once (Gemini, as built: `agentTurn` and `classifyBusiness`), with no web research; the result (traits, lookalike brands, retail category, tier, category, growth motions) is the brand's **profile**, recorded once and reused by every arm and both conditions. The taste engine builds the seed from the profile's lookalikes and traits.
- **Known brand.** Same profile. The brand's own Qloo entity joins the seed when Qloo has it under its exact name (searched as written in §2), and its Qloo price tier, if any, sets the tier, as built. The LLM is told the brand's name. Reported in full, with the leakage caveat (§11).

## 5. Tasks, candidates and arms

Every arm ranks the same candidates. A ranking is a list of tie groups; candidates an arm doesn't rank are tied below everything it ranks.

**Athena's engine (both conditions):** seed (`buildSeed`) → taste graph (`buildGraph`) → the main crowd. The stops' signal is the main crowd's signal (at most 24 entities, equal weights: what the journey sends when the founder keeps Athena's choice and reacts to nothing). If no crowd forms, the seed's lookalikes (and the brand, when known) stand in. The main crowd's brand members (strongest first, at most 50) are what Markets scores cities on.

### 5.1 T1 Where to launch

- **Candidates:** the 25 named metros: New York, Los Angeles, Chicago, Dallas-Fort Worth, Houston, Washington DC, Philadelphia, Atlanta, Miami, Phoenix, Boston, Riverside, San Francisco Bay, Detroit, Seattle, Minneapolis, Tampa, San Diego, Denver, Baltimore, Orlando, Charlotte, St. Louis, San Antonio, Austin.
- **Truth:** independent stockists per million residents (population: Census ACS 5-year 2020–2024, by CBSA).
- **Metrics:** Spearman ρ (primary), NDCG@5 (secondary, gain = stockists per million).
- **Athena:** the Markets stop as built (`markets()`, the brands method): the playbook from the profile (category, tier, motions), the main crowd as the signal, no home metro. The brand (known condition, when Qloo has it) and the main crowd's brand members, at most 50, are scored in each of the 25 metros with one Insights call per metro: `filter.type=urn:entity:brand`, `signal.location.query=<metro>`, `filter.results.entities=<the brands>`, `take=<their number>`. A metro's score is the mean `query.affinity` of the brands returned; metros with none tie last. With fewer than 5 brands (no crowd), Markets uses its venues method instead (one diversified places call, metros in order of their first venue).
- **Qloo-naive:** one Insights call, `filter.type=urn:entity:place`, the seed's signal (`seedSignal`), `filter.geocode.country_code=US`, `take=50`; metros in order of their first venue.
- **Popularity:** metros by population.
- **LLM-only:** §7.

### 5.2 T2 Which retailer next

- **Candidates:** the Next retailers list for the profile's retail category (as the brief agent read it; if it gave none, the stop's own fallback from the product's words), as in `lib/stops/retailers.ts`, keeping the retailers Qloo has under their exact name (the stop's own check):
  - food: Whole Foods Market, Erewhon, Sprouts Farmers Market, Trader Joe's, Eataly, Central Market, Wegmans, The Fresh Market, Gelson's, Bristol Farms, New Seasons Market, Natural Grocers, Publix, H-E-B, Safeway, Aldi, Ralphs, Harris Teeter, Albertsons, Foxtrot, Williams-Sonoma, Sur La Table, Thrive Market, H Mart, Target, Walmart, Costco, Kroger;
  - beauty: Sephora, Ulta Beauty, Credo Beauty, Goop, CVS, Walgreens, Nordstrom, Anthropologie, Free People, Urban Outfitters, Erewhon, Whole Foods Market, Target, Walmart, Costco, Kroger;
  - home: West Elm, Crate & Barrel, Anthropologie, Williams-Sonoma, Sur La Table, Nordstrom, Goop, Urban Outfitters, Free People, CB2, Pottery Barn, Target, Walmart, Costco, Kroger;
  - fashion: Nordstrom, Madewell, Free People, Urban Outfitters, Anthropologie, REI, Revolve, Bloomingdale's, Saks Fifth Avenue, Target, Walmart, Costco, Kroger;
  - general: all of the above, once each.
- **Truth:** a candidate is positive when at least one row of the brand's file belongs to it (venue name begins with its name or alias, §3).
- **Metrics:** AUC (primary), precision@5 (secondary).
- **Athena:** the Next retailers stop as built (`nextRetailers()`), the main crowd as the signal, no "already in" evidence; own-label retailers last, as built.
- **Qloo-naive:** one Insights call scoring the candidates (`filter.results.entities`) under the seed's signal, by affinity.
- **Popularity:** Qloo `popularity` of each retailer's entity.
- **LLM-only:** §7.

### 5.3 T3 Which venues (the ranking check, §10.3)

- **Metros:** A and B are the two metros with the most independent rows in the brand's file (ties: metro list order).
- **Signal:** metro A's independent rows in seeded order (§8), the first 80 resolved (`resolveVenue`, as built), keeping up to 50 matched, open venues.
- **Stockists:** metro B's independent rows in seeded order, resolved 10 at a time; a batch keeps the matched, open venues that Insights can see (one no-signal call, `filter.type=urn:entity:place`, `filter.results.entities=<the batch>`, returns only those it has data for; their `popularity` comes from that call). Until 25 are kept or the rows run out; the first 25 in that order. Reported: rows tried, venues resolved, venues kept.
- **Decoys, matched one to one.** For each stockist in order: places within 55 km of metro B's centre (`filter.location=POINT(<lon> <lat>)`, `filter.location.radius=55000`), no signal, `take=50`. Its kind is its Qloo `primary_genre`; without one, its `urn:tag:genre:place` tags other than shopping, restaurant and tourist_attraction; without those, all its genre tags. Search order: its kind (`filter.tags`, union) with `filter.popularity.min/max` = its popularity ± 0.01, then ± 0.05, ± 0.10, ± 0.20, pages 1–3 each; then at any popularity, pages 1–3 of its kind, of its specific genres, of all its genres, and of any place. In the first step with an acceptable candidate, candidates are sorted by entity ID, shuffled with the seed, then ordered by: same primary genre first, larger overlap of genre tags (Jaccard), smaller popularity gap. The first that is not a chain (a known chain name, or 3 or more places of exactly the same name in a Qloo place search, `take=20`) is the decoy. Acceptable: open, not a signal venue, stockist or earlier decoy, and not named like any row of the brand's file in metro B (name similarity ≥ 0.85). Reported: mean Jaccard, mean popularity gap, decoys per band.
- **Pool:** the stockists and their decoys, shuffled with the seed.
- **Athena:** one call, `filter.type=urn:entity:place`, `signal.interests.entities=<signal>`, `filter.results.entities=<pool>`, `take=<pool size>`; the order returned; unscored pool members tied last. Also reported: the share of the pool scored.
- **Popularity:** Qloo `popularity`. By design it should land near 0.5.
- **LLM-only:** §7. The LLM sees the same venues by their Qloo names, with neighbourhood (or city), and the names of the metro A signal venues.
- **Metric:** AUC over all stockist–decoy pairs, ties 0.5.
- No Qloo-naive arm: the registered call is already a single raw call.

## 6. Eligibility

- T1: the brand's independents reach at least 10 of the 25 metros, and Census returns all 25 populations.
- T2: at least one candidate is stocked and at least one is not.
- T3: at least 10 stockists in metro B kept (§5.3), a decoy for every one, and at least one signal venue in metro A.

## 7. The LLM-only arm

- **Model:** Gemini 3.1 Pro (`gemini-3.1-pro-preview`, Vertex AI, global endpoint), the model Athena uses; temperature 0.4; default thinking; at most 32,768 output tokens.
- **Two variants:** without tools (**LLM-only**, the primary comparison) and with Google Search grounding (**LLM + Search**, secondary). Same prompt; only the tool differs. [DECISION to confirm]
- **Samples:** 3 per brand, task, condition and variant. Each shows the candidates in a different seeded order (§8). The arm's metric is the mean over the 3 samples. A sample answered by another model (the client falls back to Flash when Pro is busy) is retried, up to 3 tries; the model that answered is reported.
- **Parsing:** the numbers in `ranking`, in order; unknown numbers and repeats are ignored; candidates it leaves out are tied last.

**System prompt (verbatim):**

> You advise consumer brands on where and through whom to grow in the US. Rank every item you are given. Reply with JSON only.

**Brand line (verbatim):**
- cold: `The product (the brand's name is withheld): <description>`
- known: `The brand: <name>. The product: <description>`

**Prompt (verbatim template):**

```
<brand line>

<question>

1. <candidate>
2. <candidate>
…

[LLM + Search only:] You can use Google Search; use it wherever it helps you rank.

Return JSON: {"ranking": [the number of every <metro|retailer|venue> above, best first]}
```

The bracketed line, with the blank line after it, appears only in the LLM + Search variant.

Questions (verbatim, `<n>` is the number of candidates):
- T1: `Question: in which of these US metro areas will this product find the most independent shops (not chains) to sell it, relative to the metro's population? Rank all <n> metros, most per resident first.`
- T2: `Question: which of these US retailers are most likely to carry this product? Rank all <n> retailers, most likely first.`
- T3: `These independent venues in <metro A> sell it: <signal venue names, separated by "; ">.` then a blank line, then `Question: which of these <n> venues in <metro B> are most likely to sell it too? Rank all <n> venues, most likely first.`

T3 candidates are written `<Qloo name> (<neighbourhood or city>)`.

## 8. Seeds

`BENCH_SEED = 16102026`. Every random choice uses mulberry32 (`rng` in `lib/taste/linalg.ts`) seeded with the FNV-1a hash of a label, XOR `BENCH_SEED` (`seedOf` in `lib/bench/arms.ts`), and a Fisher–Yates shuffle. Labels: `<slug>|t3|A`, `<slug>|t3|B`, `<slug>|t3|decoy|<stockist index, 0-based>`, `<slug>|t3|pool`, and for LLM samples `<slug>/<condition>|<task>|<search true/false>|<sample 1–3>`. The bootstrap uses `rng(16102026)` directly. The taste graph's own resampling uses its built-in seeds.

## 9. Statistics and pass rules

- **Primary comparisons (3), cold start:** T1 ρ, T2 AUC, T3 AUC, each Athena vs LLM-only.
- **Secondary:** every other arm, metric and condition, as listed in `summary.md`.
- **Method:** for each brand eligible for the task, the paired difference Athena − other arm; the mean over brands, with a 95% percentile bootstrap CI over brands (10,000 resamples, seeded).
- **Pass rule (each primary comparison):** the mean difference is above 0 and its 95% CI excludes 0. With 8 held-out brands (fewer where brands are ineligible) the CIs will be wide; we say so up front, and a comparison with fewer than 2 eligible brands is reported as untestable.
- **§10.3 rule, unchanged:** on at least 2 of the 3 ranking-check brands (McClure's, Rishi Tea or MUD\WTR, Paddywax), Athena's T3 AUC ≥ 0.60 and Athena's AUC − popularity AUC ≥ 0.05.

## 10. Cold-start descriptions (verbatim)

From `proof/bench/descriptions.json`. Written from each brand's public product information: what it is, price, look and customer; no brand name, no US place, nothing about where it is sold.

| Brand | Description |
|---|---|
| Brightland | Premium extra-virgin olive oil and vinegars, pressed from olives grown on small family farms and bottled in opaque, brightly coloured glass bottles designed to stay out on the counter. About $37 a bottle, plus gift sets. For people who cook at home and care about ingredients, design and a good-looking kitchen. |
| Fishwife | Premium tinned seafood: smoked salmon, smoked trout, sardines, anchovies and mackerel, sustainably sourced and packed in brightly illustrated, collectible tins. About $10-15 a tin, plus multi-tin gift boxes. For younger food lovers who treat tinned fish as an easy, fun meal or snack rather than a pantry staple. |
| McClure's Pickles | Small-batch pickles made from a family recipe: garlic-dill and spicy spears, chips and relish, plus kettle-cooked potato chips and a bloody mary mix made with the pickle brine. About $10 a jar. For people who love bold, classic deli flavours and craft food. |
| Rishi Tea & Botanicals | Organic, direct-trade loose-leaf teas and botanical blends: matcha, green, black, oolong and pu-erh teas and caffeine-free herbal blends, sold as loose leaf and sachets. About $10-30 a pouch. For serious tea drinkers who care about sourcing and flavour. |
| Paddywax | Scented candles, reed diffusers and room sprays in decorative vessels (tinted glass, ceramic and novelty jars), grouped into fragrance collections, some made with artists and well-known franchises. About $15-50. Design-led and giftable, for people who like their home to smell good and look styled. |
| Raaka Chocolate | Bean-to-bar chocolate made from unroasted, organic, directly traded cacao, in bold flavours such as fruit, spice, tea and herb pairings. About $8-10 a bar, plus tasting boxes and chocolate-making classes. For adventurous chocolate lovers who care about sourcing and want something different from a classic bar. |
| Dick Taylor Craft Chocolate | Craft bean-to-bar chocolate made with just two ingredients, cacao and cane sugar, from single-origin beans, in finely illustrated wrappers, plus a few bars with added ingredients. About $9-12 a bar. For chocolate enthusiasts and gift buyers who appreciate small-batch, handmade food. |
| Diaspora Co. | Single-origin spices (turmeric, chillies, cardamom, peppercorns, cumin, saffron) sourced directly from partner farms in South Asia, paid well above commodity prices, and sold fresh in small tins. About $10-20 a tin, plus gift sets. For home cooks who care about flavour, freshness and fair sourcing. |
| Juniper Ridge | Wild-harvested botanical fragrances and body care: colognes, soaps, deodorants, incense and room sprays distilled from plants gathered in mountains and forests, in simple, outdoorsy packaging. About $15-100. Unisex and natural, for people who love hiking, the outdoors and scents that smell like a real place. |
| MUD\WTR | A coffee alternative: a powdered blend of cacao, masala chai spices, turmeric and four mushrooms (lion's mane, chaga, cordyceps, reishi), with about a seventh of the caffeine of coffee. Sold in tins and single-serve packs, about $40 for 30 servings. For wellness-minded people who want to cut back on coffee without losing the ritual. |

## 11. Disclosures

- **Earlier Qloo calls on Bench brands.** On 8 Oct (the key-day spike), one Qloo brand search was made for each of the 10 stockist brands (Brightland, MUD\WTR and Juniper Ridge were found). MUD\WTR was also used as a signal in the 8 Oct theme and positioning checks. Fishwife's NYC stockists (a sample of 40) were resolved on 8 Oct, one brand search for "Fishwife" was made on 10 Oct, and Fishwife was a development case for the taste graph. MUD\WTR and Juniper Ridge are category anchor brands in Athena's code (`lib/playbook/anchors.ts`), so development runs for other brands used them as signals. No other Qloo or LLM call was made on a held-out brand before registration.
- **Brightland and Fishwife are tuning brands.** Athena was developed with Brightland throughout (the §10.1 blind test, §10.3 tuning). Their Bench results are published as tuning data and never pooled with the held-out results.
- **The descriptions may identify a brand.** A product description specific enough to be useful (unroasted cacao, a bloody mary mix made with pickle brine) may let the LLM recognise the brand, and with Search it can look the brand up. That favours the LLM arms; we don't correct for it.
- **Known condition leakage.** Given the brand's name, the LLM (especially with Search) can read the brand's store locator, the ground truth itself. The known condition is reported in full with this caveat and is never the headline.
- **The descriptions were written by the developers** from public product information, before any Bench call on the held-out brands.
- **Changes after the tuning run** are listed in §12.

## 12. Tuning run (Brightland and Fishwife)

To be filled from `proof/bench/tuning/` before registering: results, and any change made to the arms because of them.

## 13. Cost

Qloo: about 300–450 calls per brand (the T3 venue resolution is most of it), within the two keys' monthly limit. Gemini 3.1 Pro on Vertex: $2.00 per 1M input tokens and $12.00 per 1M output tokens, reasoning included (Google Cloud pricing page, read 13 Oct 2026); Search grounding for Gemini 3: 5,000 queries a month free, then $14 per 1,000. About 36 Pro prompts per brand; all inside the $300 credit.
