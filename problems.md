# Problems

Problems with Athena as built, gathered before the next rework. Each entry has the founder's words, then a precise statement. Once the list is complete, `rework_plan.md` turns it into exact steps; nothing is built until then.

---

## 0. Overarching: Athena is a pipeline, not an agent

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

## 1. The Taste Galaxy shows the measurement and asks the founder to finish the job

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

## 2. Athena doesn't know what time of year it is

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

## 3. Onboarding is a static chatbot that makes the founder do the work

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

## 4. What Athena understood is a static card

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

## 5. Features sit behind one fixed path

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
