import Link from "next/link";
import s from "./landing.module.css";

// The landing page: a headline, one line, one way in (/start), and a quiet picture of Athena at work.
// The run shown is a fictional example brand, written by hand: no Qloo data.

const PLAN = [
  { text: "Read your brand", done: true },
  { text: "Find your crowds", done: true },
  { text: "Rank the most valuable fits", done: true },
  { text: "Pick the cities", done: false },
  { text: "Build the plan", done: false },
];

const RUN = [
  { what: "Read the website", found: "14 pages, 3 product lines, sold in 6 shops" },
  { what: "Looked it up in the taste graph", found: "4 crowds share what its customers love" },
  { what: "Ranked the crowds", found: "Win first: design-minded home cooks" },
  { what: "Checked reach city by city", found: "Portland and Austin lead on fit and reach" },
  { what: "Picking the neighbourhoods", found: "" },
];

// Node positions on a 320 × 240 canvas: the brand in the middle, crowds around it, what they love at the edge.
const NODES = [
  { x: 160, y: 120, r: 9, label: "Your brand", kind: "brand" },
  { x: 82, y: 70, r: 6, label: "Home cooks", kind: "crowd" },
  { x: 246, y: 78, r: 6, label: "Slow living", kind: "crowd" },
  { x: 92, y: 182, r: 6, label: "Weekend hosts", kind: "crowd" },
  { x: 236, y: 178, r: 5, label: "Coffee nerds", kind: "crowd" },
  { x: 38, y: 28, r: 3.5, label: "Ceramics", kind: "love" },
  { x: 150, y: 30, r: 3.5, label: "Natural wine", kind: "love" },
  { x: 296, y: 30, r: 3.5, label: "Indie folk", kind: "love" },
  { x: 44, y: 132, r: 3.5, label: "Farmers markets", kind: "love" },
  { x: 300, y: 128, r: 3.5, label: "Portland", kind: "love" },
  { x: 40, y: 224, r: 3.5, label: "Supper clubs", kind: "love" },
  { x: 290, y: 222, r: 3.5, label: "Austin", kind: "love" },
];
const EDGES = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6], [2, 6], [2, 7], [1, 8], [2, 9], [3, 8], [3, 10], [4, 9], [4, 11]];

export default function Landing() {
  return (
    <div className={s.page}>
      <header className={s.top}>
        <span className={s.mark}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
            <circle cx="10" cy="10" r="3" fill="currentColor" />
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
          </svg>
          Athena
        </span>
        <Link href="/start" className={s.small}>Get started</Link>
      </header>

      <main className={s.main}>
        <section className={s.hero}>
          <p className={s.pill}><span className={s.dot} aria-hidden />A growth agent for consumer brands</p>
          <h1 className={s.title}>Your customers aren&apos;t&nbsp;a demographic.</h1>
          <p className={s.sub}>
            &ldquo;Women, 25 to 34&rdquo; never bought anything. Athena finds the people who&apos;d love what you make by what they already love, and
            tells you where they are, who to team up with, and when to show up.
          </p>
          <Link href="/start" className={s.cta}>Get started <span aria-hidden>→</span></Link>
        </section>

        <figure className={s.shot} aria-label="Athena at work on an example brand">
          <div className={s.chrome}>
            <span /><span /><span />
            <em>Example brand · a fictional coffee roaster</em>
          </div>
          <div className={s.panes}>
            <ol className={s.plan}>
              {PLAN.map((p, i) => (
                <li key={p.text} className={p.done ? s.done : i === PLAN.findIndex((q) => !q.done) ? s.now : s.todo}>
                  <span className={s.box} aria-hidden>{p.done ? "✓" : ""}</span>
                  {p.text}
                </li>
              ))}
            </ol>
            <ol className={s.run}>
              {RUN.map((r, i) => (
                <li key={r.what} style={{ animationDelay: `${0.35 + i * 0.55}s` }} className={r.found ? undefined : s.live}>
                  <strong>{r.what}</strong>
                  {r.found ? <span>{r.found}</span> : <span className={s.shimmer}>working…</span>}
                </li>
              ))}
            </ol>
            <svg className={s.graph} viewBox="0 0 320 250" aria-hidden>
              {EDGES.map(([a, b], i) => (
                <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} style={{ animationDelay: `${0.6 + i * 0.12}s` }} />
              ))}
              {NODES.map((n, i) => (
                <g key={n.label} className={s[n.kind]} style={{ animationDelay: `${0.3 + i * 0.14}s` }}>
                  <circle cx={n.x} cy={n.y} r={n.r} />
                  <text x={n.x} y={n.y + n.r + 11}>{n.label}</text>
                </g>
              ))}
            </svg>
          </div>
        </figure>

        <ul className={s.points}>
          <li><strong>Who loves you</strong><span>The crowds your brand already speaks to, ranked by what they&apos;re worth.</span></li>
          <li><strong>Where to grow</strong><span>Cities, neighbourhoods, shops and partners where those crowds are.</span></li>
          <li><strong>When to show up</strong><span>The moments and seasons that matter to them, with lead times.</span></li>
        </ul>

        <p className={s.note}>Built on Qloo&apos;s taste data. Every answer shows where it came from.</p>
      </main>
    </div>
  );
}
