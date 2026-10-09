import Link from "next/link";
import { GROWTH, GROWTH_ORDER } from "@/lib/journey/growth";

// The landing page (§2.2, v3.0): what Athena does, how the journey goes, what it can plan; one way in (/start).

const STEPS = [
  { n: "1", title: "Tell Athena about your product", text: "What it is, what it costs, how it looks, where it sells. Drop in a deck, photos or a store list. It never asks you to describe your customers." },
  { n: "2", title: "Pick how you want to grow", text: "Up to three directions: more stores, a new city, a new crowd, collabs, online, events." },
  { n: "3", title: "Meet your crowds", text: "Athena reads your product into Qloo's taste graph and finds the two or three crowds who'd love it: what they love, where they are." },
  { n: "4", title: "Walk the plan, one decision at a time", text: "Where to start, which venues and retailers, who to partner with, what to say, when to show up. Then work it all from one dashboard." },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-top">
        <strong className="wordmark">Athena</strong>
        <nav>
          <Link href="/method">Method</Link>
          <Link href="/start" className="button primary">Start planning</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">The taste-led growth agent for consumer startups</p>
          <h1>Describe your product. Meet the crowds who&apos;d love it.</h1>
          <p className="hero-sub">
            Athena turns what you sell into the people most likely to love it: the brands, music, shows and places they share, and the cities where
            they are. Then it walks you through a growth plan one decision at a time: which crowd, where to start, which venues and retailers, who to
            partner with, what to say and when to show up.
          </p>
          <div className="hero-actions">
            <Link href="/start" className="button primary big">Start planning →</Link>
            <Link href="/method" className="button big">How it works</Link>
          </div>
          <p className="muted small">Taste data from Qloo, read and written up with Gemini. Every ranking shows the calls behind it.</p>
        </section>

        <section className="steps-row" aria-label="How it works">
          <h2>How the journey goes</h2>
          <ol>
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="step-n">{s.n}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p className="muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="capabilities" aria-label="What Athena plans">
          <h2>Ways to grow</h2>
          <ul>
            {GROWTH_ORDER.map((g) => (
              <li key={g}>
                <h3>{GROWTH[g].label}{GROWTH[g].beta ? " (Beta)" : ""}</h3>
                <p>{GROWTH[g].question}</p>
              </li>
            ))}
          </ul>
          <Link href="/start" className="button primary big">Start planning →</Link>
        </section>
      </main>

      <footer className="foot">
        <Link href="/method">Method</Link> · <Link href="/sources">Sources</Link> · <Link href="/unknowns">What we don&apos;t know</Link> · Sample brands are built from public info and not affiliated with us · Data: Qloo
      </footer>
    </div>
  );
}
