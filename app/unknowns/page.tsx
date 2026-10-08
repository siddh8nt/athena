import Link from "next/link";

export const metadata = { title: "What we don't know · Athena" };

const UNKNOWNS: [string, string][] = [
  ["Causation", "Whether a taste match causes stocking, bookings or collabs. Athena ranks whom to approach; price, margin, distribution and timing decide the rest."],
  ["Ranking accuracy", "The stockist blind test failed. Whether the pre-registered ranking check passes is open until it runs."],
  ["Coverage", "Qloo has about half of the small independent venues we tested, and many small food brands aren't in Qloo at all; results for them lean on comparable brands."],
  ["Partners", "Whether high two-sided taste fit goes with collabs that happen, or work."],
  ["Message", "Whether taste-grounded hooks perform better than a founder's own copy. Nothing in Message is measured."],
  ["Moments", "Whether showing up at a taste-matched event drives sales. Ticketmaster covers ticketed events only; festival dates come from web pages."],
  ["Audience", "Qloo's demographics and interests describe a taste panel, not a brand's customers. They are never used for ranking or targeting."],
  ["Launch order", "Whether taste-ranked launch cities beat population-ranked ones for apps."],
  ["Declines", "Whether learning from declines improves results; only the mechanics are shown, because no real decline data exists yet."],
  ["Data drift", "How far Qloo's regular data updates move live results away from the published ones. Every result carries its date."],
];

/** What we don't know (§21, F25). */
export default function UnknownsPage() {
  return (
    <main className="doc">
      <p><Link href="/">← Back to Athena</Link></p>
      <h1>What we don&apos;t know</h1>
      <dl className="unknowns">
        {UNKNOWNS.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p><Link href="/method">Method</Link> · <Link href="/sources">Sources</Link></p>
    </main>
  );
}
