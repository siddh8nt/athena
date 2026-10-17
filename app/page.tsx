import type { CSSProperties } from "react";
import Link from "next/link";
import s from "./landing.module.css";
import HeroGlow from "./HeroGlow";
import LandingNav from "./LandingNav";

// The landing page: a headline, one line, one way in (/plan), and a quiet picture of Athena at work.
// The run shown is a fictional example brand, written by hand: no Qloo data.

// The team panel as the product shows it: Athena and the Analyst first, then the specialists the chosen goal needs.
const TEAM = [
  { name: "Athena", role: "Leads the team", state: "done" },
  { name: "Analyst", role: "Fingerprint, crowds and rivals", state: "done" },
  { name: "Navigator", role: "Cities and neighbourhoods", state: "working" },
  { name: "Rep", role: "Needs a city first", state: "waiting" },
] as const;

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
    <div className={`${s.page} landing-page`}>
      <LandingNav />

      <main className={s.main}>
        <HeroGlow className={s.hero}>
          <p className={s.pill}>A growth agent for consumer brands</p>
          <h1 className={s.title} aria-label="Stop selling to everyone.">
            {/* Each word rises out of its own line mask on entry; the last two never part. */}
            <span aria-hidden>
              <span className={s.word} style={{ "--i": 0 } as CSSProperties}><span>Stop</span></span>{" "}
              <span className={s.word} style={{ "--i": 1 } as CSSProperties}><span>selling</span></span>{" "}
              <span className={s.nowrap}>
                <span className={s.word} style={{ "--i": 2 } as CSSProperties}><span>to</span></span>{" "}
                <span className={s.word} style={{ "--i": 3 } as CSSProperties}><span>everyone.</span></span>
              </span>
            </span>
          </h1>
          <p className={s.sub}>
            Your best customers already exist. You just haven&apos;t met them yet. Athena reads the taste of millions of people to spot the crowds
            already wired to love your brand. Then it puts you in their path: the right cities, the right shelves, the right collabs, at the right
            moment.
          </p>
          <Link href="/plan?new=1" className={s.cta}>Get started <span aria-hidden>→</span></Link>
        </HeroGlow>

        {/* On the first screen only the top of the product picture shows under the hero; its title opens above it as
            soon as the page moves, so the title still comes first. */}
        <section id="at-work" className={`${s.section} ${s.peek}`}>
          <div className={s.peekHead}>
            <div>
              <div className={s.chapter}>
                <header className={s.sectionHead}>
                  <span className={s.index}>01</span>
                  <h2>Athena at work</h2>
                </header>
                <span className={s.chapterLine} aria-hidden />
              </div>
            </div>
          </div>
          <figure className={s.shot} aria-label="Athena at work on an example brand">
            <div className={s.panes}>
              <div className={s.plan}>
              <p className={s.goal}><span>Goal</span>Launch in Portland</p>
              <ul>
                {TEAM.map((a) => (
                  <li key={a.name} className={s[a.state]}>
                    <span className={s.badge} aria-hidden>{a.name[0]}</span>
                    <span className={s.who}><strong>{a.name}</strong><small>{a.role}</small></span>
                    <span className={s.state} aria-label={a.state} />
                  </li>
                ))}
              </ul>
            </div>
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
            <figcaption>Example brand · a fictional coffee roaster</figcaption>
          </figure>
        </section>

        <section id="why" className={`${s.section} ${s.next}`}>
          <div className={`${s.chapter} ${s.joined}`}>
            <header className={s.sectionHead}>
              <span className={s.index}>02</span>
              <h2>Why Athena</h2>
            </header>
            <span className={s.chapterLine} aria-hidden />
          </div>
          <ol className={s.points}>
            <li><em>i.</em><strong>It reads your brand</strong><span>Your site, decks and spreadsheets become one Brand Graph. Every fact keeps its source, and any of it is yours to edit.</span></li>
            <li><em>ii.</em><strong>It ranks who to win</strong><span>The Analyst measures the crowds who share your customers&apos; taste and ranks them: win first, win next, watch.</span></li>
            <li><em>iii.</em><strong>A team works your goals</strong><span>Pick a goal and Athena hands it to her specialists: the cities, shops, partners and events to go after, with lead times.</span></li>
          </ol>
        </section>

        {/* The closing bookend: a dark card that echoes the hero, one last way in, then the small print. */}
        <footer className={s.foot}>
          <div className={s.footCall}>
            <h2>Go meet your crowd.</h2>
            <Link href="/plan?new=1" className={s.cta}>Get started <span aria-hidden>→</span></Link>
          </div>
          <div className={s.footGrid}>
            <div className={s.footBrand}>
              <Link href="/" className={s.mark} aria-label="Athena"><span className={s.dots} aria-hidden><i /><i /></span>Athena</Link>
              <p>A growth agent for consumer brands. It finds the crowds already wired to love you, and puts you in their path.</p>
            </div>
            <nav aria-label="Footer">
              <h3>On this page</h3>
              <a href="#at-work">Athena at work</a>
              <a href="#why">Why Athena</a>
            </nav>
            <nav aria-label="Start">
              <h3>Start</h3>
              <Link href="/plan?new=1">Plan a launch</Link>
            </nav>
          </div>
          <div className={s.footBase}>
            <p>Built on Qloo&apos;s taste data. Every answer shows where it came from.</p>
            <p>© Athena</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
