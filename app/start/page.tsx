import Link from "next/link";
import { PACKS } from "@/lib/journey/packs";

export const metadata = { title: "Start · Athena" };

// The way in (§2.2, v3.0): your own brand, or a sample brand built from public info that runs live.
export default function Start() {
  return (
    <div className="landing">
      <header className="landing-top">
        <Link href="/" className="wordmark">Athena</Link>
      </header>
      <main className="start">
        <h1>Where do you want to start?</h1>
        <p className="muted">Bring your own brand, or watch Athena work on a real one from its public info. Either way, it runs live.</p>

        <Link href="/plan?new=1" className="choice choice-own">
          <span className="choice-tag">Your brand · live</span>
          <strong>Try your own brand</strong>
          <span>Describe your product and drop in anything you have. Athena reads it into Qloo&apos;s taste graph, finds the crowds who&apos;d love it, and walks you through the plan one decision at a time.</span>
          <span className="choice-go">Start →</span>
        </Link>

        <h2>Or try a sample brand</h2>
        <div className="choices">
          {PACKS.map((p) => (
            <Link key={p.slug} href={`/plan?pack=${p.slug}`} className="choice">
              <span className="choice-tag">{p.shows}</span>
              <strong>{p.name}</strong>
              <span>{p.contents}</span>
              <span className="muted small">Built from public info; not affiliated with {p.name}.</span>
              <span className="choice-go">Run it live →</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
