import Link from "next/link";

// The landing page: what Athena does, then one way in (/start).

const CAPABILITIES = [
  { name: "Read", text: "Reads your brand from whatever you have: a sentence, a deck, a stockist sheet, a screenshot, your site." },
  { name: "Markets", text: "Ranks US cities by how strongly your customers' tastes show up there, so you know where to grow next." },
  { name: "Places", text: "Picks the cafés, shops and venues whose crowd looks like yours, each with the evidence behind it." },
  { name: "Partners", text: "Finds brands and podcasts your customers over-index on, for collaborations that reach the right people." },
  { name: "Message", text: "Turns your crowd's taste into themes, references and hooks, every claim checked against the data." },
  { name: "Moments", text: "Lines up the shows, festivals and markets your crowd already goes to, soonest first." },
];

const STEPS = [
  { n: "1", title: "Tell Athena about your brand", text: "Type a sentence and drop in anything you have. It asks only for what's missing." },
  { n: "2", title: "Watch the plan build", text: "Each step is narrated as it runs, and it never stops to wait on you." },
  { n: "3", title: "Act on it", text: "Draft outreach, reorder your targets and track them in a simple pipeline." },
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
          <h1>Grow where your customers already are.</h1>
          <p className="hero-sub">
            Athena reads what your customers love (the venues, brands, artists and places they share) and turns it into a growth plan: which city next, which
            venues to pitch, who to partner with, what to say and when to show up.
          </p>
          <div className="hero-actions">
            <Link href="/start" className="button primary big">Start planning →</Link>
            <Link href="/method" className="button big">How it works</Link>
          </div>
          <p className="muted small">Taste data from Qloo, read and written up with Gemini. Every ranking shows the calls behind it.</p>
        </section>

        <section className="capabilities" aria-label="What Athena plans">
          <h2>One plan, six parts</h2>
          <ul>
            {CAPABILITIES.map((c) => (
              <li key={c.name}>
                <h3>{c.name}</h3>
                <p>{c.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="steps-row" aria-label="How it works">
          <h2>From a sentence to a plan in about a minute</h2>
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
          <Link href="/start" className="button primary big">Start planning →</Link>
        </section>
      </main>

      <footer className="foot">
        <Link href="/method">Method</Link> · <Link href="/sources">Sources</Link> · <Link href="/unknowns">What we don&apos;t know</Link> · Illustrative plans from public data; not affiliated with the brands shown · Data: Qloo
      </footer>
    </div>
  );
}
