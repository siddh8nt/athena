import Link from "next/link";
import { DEMO_BRANDS } from "@/lib/playbook/demo";

export const metadata = { title: "Start · Athena" };

// The way in: a ready demo brand, or your own.
export default function Start() {
  return (
    <div className="landing">
      <header className="landing-top">
        <Link href="/" className="wordmark">Athena</Link>
        <nav>
          <Link href="/method">Method</Link>
        </nav>
      </header>
      <main className="start">
        <h1>Where do you want to start?</h1>
        <p className="muted">Explore a plan Athena has already built, or build one for your own brand.</p>

        <Link href={`/${DEMO_BRANDS[0].slug}?own=1`} className="choice choice-own">
          <span className="choice-tag">Your brand · live</span>
          <strong>Try your own brand</strong>
          <span>Describe it in a sentence and drop in a deck, stockist list or screenshots. Athena asks only for what&apos;s missing, then builds your plan live.</span>
          <span className="choice-go">Start →</span>
        </Link>

        <h2>Or explore a demo brand</h2>
        <div className="choices">
          {DEMO_BRANDS.map((b) => (
            <Link key={b.slug} href={`/${b.slug}`} className="choice">
              <span className="choice-tag">{b.blurb}</span>
              <strong>{b.name}</strong>
              <span>{b.description}</span>
              <span className="choice-go">Open plan →</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
