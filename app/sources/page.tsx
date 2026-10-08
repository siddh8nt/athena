import Link from "next/link";

export const metadata = { title: "Sources · Athena" };

const SOURCES: { name: string; use: string; terms: string }[] = [
  { name: "Qloo Taste AI (hackathon API)", use: "Every ranking: cities, venues, partners, podcasts, themes, cultural references, audiences, artists, festivals, heatmaps.", terms: "Used under the Qloo hackathon terms. No Qloo data is stored in the code repository; responses are cached privately." },
  { name: "U.S. Census Bureau, ACS 5-year (2020–2024)", use: "Metro population and median household income on Markets.", terms: "Public domain. Cited as \"U.S. Census Bureau, ACS 5-year\"." },
  { name: "Ticketmaster Discovery API", use: "Dated upcoming shows by the crowd's top Qloo artists, in Moments.", terms: "Used under the Discovery API terms: no revenue from the API, links out for tickets, content removed within 24 hours on request." },
  { name: "Apple Podcasts (iTunes Search API lookup) and each show's public RSS feed", use: "A podcast's episode count, latest episode date, genre, website and published contact email, looked up by the Apple ID Qloo returns.", terms: "Metadata only, no artwork or audio; about 20 lookups a minute at most, cached for a day as Apple asks; links go to Apple Podcasts." },
  { name: "Google Search grounding (Gemini on Vertex AI)", use: "Festival dates and podcast audience figures (each with the page that states them), and the Without Qloo baseline.", terms: "Grounded results show Google's Search Suggestions, as the terms require." },
  { name: "Gemini URL context (Vertex AI)", use: "Reading a brand's own website during intake.", terms: "Pages are read by Google, not by Athena's server; page text is treated as data." },
  { name: "Brands' public store locators", use: "Stockist lists for the demo brands.", terms: "Public business listings. Demo plans for real brands are illustrative and unaffiliated." },
  { name: "OpenFreeMap, OpenMapTiles, OpenStreetMap", use: "The base map.", terms: "© OpenMapTiles, data © OpenStreetMap contributors (ODbL)." },
];

/** Sources page (§2.5, §15, F25): every data source, what it's used for, and its terms and attribution. */
export default function SourcesPage() {
  return (
    <main className="doc">
      <p><Link href="/">← Back to Athena</Link></p>
      <h1>Sources</h1>
      <p className="lede">Qloo is the only source that ranks anything. Every other source attaches a fact to a Qloo result, and every value on screen carries its source label.</p>
      <table>
        <thead><tr><th>Source</th><th>Used for</th><th>Terms and attribution</th></tr></thead>
        <tbody>
          {SOURCES.map((s) => (
            <tr key={s.name}><td><strong>{s.name}</strong></td><td>{s.use}</td><td>{s.terms}</td></tr>
          ))}
        </tbody>
      </table>
      <p><Link href="/method">Method</Link> · <Link href="/unknowns">What we don&apos;t know</Link></p>
    </main>
  );
}
