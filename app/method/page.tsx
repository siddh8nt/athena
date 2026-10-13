import Link from "next/link";
import { getCachedComparison } from "@/lib/proof/without-qloo";
import { DEMO_BRANDS } from "@/lib/playbook/demo";
import { metroById } from "@/lib/playbook/metros";
import { benchPrimaries, benchTable } from "@/lib/bench/lines";

export const dynamic = "force-dynamic";
export const metadata = { title: "Method · Athena" };

const pct = (x: number | undefined) => (x === undefined ? "—" : `${Math.round(x * 100)}%`);
const num = (x: number | undefined) => (x === undefined ? "—" : x.toFixed(2).replace(/^-/, "−"));

/** The Method page (§2.5, F25): how Athena works, what was tested, and what failed, with computed numbers only. */
export default async function MethodPage() {
  const rows = await Promise.all(
    DEMO_BRANDS.map(async (b) => {
      const metroId = b.targetMetro;
      const c = await getCachedComparison(b.slug, metroId).catch(() => undefined);
      return { b, metroId, c };
    }),
  );
  return (
    <main className="doc">
      <p><Link href="/">← Back to Athena</Link></p>
      <h1>Method</h1>
      <p className="lede">How Athena turns what a brand&apos;s customers already love into a growth plan, what we tested on the live Qloo API, and what failed.</p>

      <h2>How a plan is built</h2>
      <ol>
        <li><strong>Read the business.</strong> Athena finds the brand in Qloo, reads its website with Gemini, classifies it (category, price tier, how it grows), and matches any stockists to Qloo venues. Qloo&apos;s price data overrules the model when they disagree.</li>
        <li><strong>Choose the taste signal.</strong> Places and the Read card use the brand&apos;s accounts (its stockists in Qloo). Markets, Partners, Message and Moments use the brand itself plus comparable brands. On 8 Oct the accounts-only signal returned the venues&apos; whole local crowd (fashion partners, Bronx hip-hop artists), while the brand signal returned the brand&apos;s real markets and category.</li>
        <li><strong>Rank only with Qloo.</strong> Cities, venues, partners, podcasts, themes, references, artists and festivals are all Qloo rankings. Census, Ticketmaster and web search only attach facts; they never change an order.</li>
        <li><strong>Compare across calls only through percentiles over one fixed pool</strong> (≤ 50 items). Mutual fit and shared loves take the weaker of two sides (min). Re-ranking scores fit − 0.5 × decline over the same pool.</li>
        <li><strong>Check every sentence the model writes.</strong> Hooks, drafts and card lines list their claims; any name or number not in this run&apos;s Qloo evidence is removed.</li>
      </ol>

      <h2>With Qloo vs Without Qloo (demonstrated, not measured)</h2>
      <p>The same Places question goes to <code>gemini-3.1-pro-preview</code> with Google Search and no Qloo tools. Every venue it names is checked in Qloo.</p>
      <table>
        <thead>
          <tr><th>Brand · city</th><th>Chatbot venues closed or not found</th><th>Chatbot taste fit (median rank in a shared pool)</th><th>Most popular 5%: chatbot vs Athena</th><th>Run</th></tr>
        </thead>
        <tbody>
          {rows.map(({ b, metroId, c }) => (
            <tr key={b.slug}>
              <td>{b.name} · {metroById(metroId).name}</td>
              {c ? (
                <>
                  <td>{c.llm.filter((v) => v.status !== "found").length} of {c.llm.length}</td>
                  <td>{c.metrics.tasteFitMedianRank !== undefined ? `#${Math.round(c.metrics.tasteFitMedianRank)} of ${c.metrics.poolSize}` : "—"}</td>
                  <td>{pct(c.metrics.mostObviousLlm)} vs {pct(c.metrics.mostObviousAthena)}</td>
                  <td>{new Date(c.ranAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                </>
              ) : (
                <td colSpan={4} className="muted">Runs with the next warm-cache job</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p>The chatbot&apos;s lists are credible, so this is not a straw man. Athena&apos;s edge is taste fit, Qloo evidence on every pick and no unverified picks. &quot;Couldn&apos;t verify&quot; means Qloo found no matching venue within 40 miles; it does not mean the chatbot made the place up. Taste fit is scored by Qloo itself, so this comparison illustrates the difference; the ranking check below is the independent test. It is <em>not</em> less obvious: on all three brands, more of Athena&apos;s picks sit among Qloo&apos;s most popular 5%. We show that rather than hide it.</p>

      <h2>The stockist blind test: run on 8 Oct, failed</h2>
      <p>We hid Brightland&apos;s 87 Los Angeles independent stockists, used its 56 New York stockists as the signal, and asked whether Athena&apos;s top 50 LA venues would include them.</p>
      <table>
        <thead><tr><th>Variant</th><th>Athena hits in top 50</th><th>Most popular, hits in top 50</th></tr></thead>
        <tbody>
          <tr><td>Planned channels, Los Angeles</td><td>1 of 87</td><td>0</td></tr>
          <tr><td>Data-derived channels</td><td>1</td><td>0</td></tr>
          <tr><td>Retail-only channels</td><td>1</td><td>1</td></tr>
          <tr><td>Data-derived + price level 2–4</td><td>1</td><td>1</td></tr>
          <tr><td>Metro-wide (55 km radius)</td><td>1</td><td>0</td></tr>
        </tbody>
      </table>
      <p><strong>Why:</strong> Qloo has about half of the small venues tested; a top 50 is a tiny slice of thousands of venues; in a same-call test real stockists ranked above same-type decoys 61% of the time, but only 12 of 38 were scored. <strong>So Athena makes no hit-count claims.</strong> A pre-registered ranking check on three other brands is the one measured claim we will publish, whatever it shows.</p>

      <h2 id="bench">The Taste Bench: held-out brands (measured)</h2>
      <p>Registered at the <code>prereg-v2</code> tag before any held-out run: Athena against one raw Qloo call, against plain popularity, and against Gemini 3.1 Pro alone given the same product and candidates, with and without Google Search. Scored against eight held-out brands&apos; real stockists, cold start (the brand&apos;s name withheld). A brand with too little ground truth for a task is left out of it.</p>
      <table>
        <thead><tr><th>Question</th><th>Brands</th><th>Athena</th><th>One raw Qloo call</th><th>Popularity</th><th>Gemini alone</th><th>Gemini + Search</th></tr></thead>
        <tbody>
          {benchTable().map((r) => (
            <tr key={r.task}><td>{r.question}, {r.metric}</td><td>{r.n}</td><td>{num(r.athena)}</td><td>{num(r.naive)}</td><td>{num(r.popularity)}</td><td>{num(r.gemini)}</td><td>{num(r.geminiSearch)}</td></tr>
          ))}
        </tbody>
      </table>
      <p>The registered primary tests, each the mean paired difference over brands with a 95% bootstrap interval; a test passes when the difference is above 0 and the interval excludes 0:</p>
      <ul>
        {benchPrimaries().map((p) => (
          <li key={p.label}>{p.label}: {num(p.diff)} [{num(p.lo)}, {num(p.hi)}], {p.n} brands: <strong>{p.pass ? "passes" : "does not pass"}</strong></li>
        ))}
      </ul>
      <p>What this supports: Athena gets more out of Qloo than one raw call, and Qloo&apos;s taste beats popularity, for cities and retailers. It does not support venues, and Gemini alone scored higher than Athena on all three questions. We don&apos;t claim Athena or Qloo ranks stockists better than an LLM.</p>

      <h2 id="ranking-check">The ranking check: the one measured claim</h2>
      <p>For three brands Athena was never tuned on (Fishwife, Rishi Tea, Paddywax), each brand&apos;s real stockists in one city are mixed with look-alike venues of the same types that don&apos;t stock it. Qloo ranks the whole pool from the brand&apos;s other accounts. It passes if real stockists rank higher than chance and higher than simply picking the most popular venues.</p>
      <p>The rules (brands, pools, seed and pass mark) are written down and committed before the first run, so they can&apos;t be changed after seeing the results. <strong>Not run yet.</strong> The result is published here whatever it shows.</p>

      <h2>Key-day checks against the live Qloo API (8 Oct)</h2>
      <ul>
        <li>Place, brand, podcast, artist, tag, demographics, audience and heatmap requests all work; <code>/v2/trending</code> returned nothing and locality month tags were absent.</li>
        <li><code>take</code> and fixed pools cap at 50; about a third of a 50-venue pool comes back unscored, and is ranked below every scored item.</li>
        <li>Place calls take 7–27 s, so the demo brands are prepared daily by a warm-cache job and every live step is narrated.</li>
        <li>Excluding a city needs &quot;New York&quot;, not &quot;New York City&quot;; metros are kept to the US.</li>
      </ul>

      <h2>Models</h2>
      <p>Gemini on Vertex AI, global endpoint: <code>gemini-3.8-flash</code> for reading, classifying and writing; <code>gemini-3.1-pro-preview</code> with Google Search for the Without Qloo baseline and festival dates. Grounded results show Google&apos;s Search Suggestions.</p>
      <p><Link href="/sources">Sources and attributions</Link> · <Link href="/unknowns">What we don&apos;t know</Link></p>
    </main>
  );
}
