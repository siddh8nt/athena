"use client";

import { Fragment, type ReactNode } from "react";
import type { AgentEvent } from "@/lib/blocks/types";
import { NEAR_MISS_LABEL, type CrowdCard, type FitsRun } from "@/lib/journey/types";
import { HORIZON_LABEL, PARAMS, PARAM_LABEL, TIER_LABEL, type Calendar, type Fit, type FitsAnswer, type Horizon, type Moment, type SourceRef, type Tier } from "@/lib/fits/types";
import { MONTHS } from "@/lib/fits/score";
import { Question, type Asked } from "./Question";
import type { CrowdDecision } from "./Galaxy";
import { Cites, day } from "./Cites";
import { StrategyCard, StrategyHead, StrategyPending, type StrategyView } from "./Strategy";

// Most valuable fits (PRD §23.2 step 5): who to win first, next, and who to watch, with the six measures behind each
// tier, the weights the founder's context moved, and when to move. Code computes the ranking and the calendar; the
// agent's sentences explain them, each with the sources it read. "Most valuable fit", never predicted sales.


const TIERS: Tier[] = ["win_first", "win_next", "watch"];
const HORIZONS: Horizon[] = ["now", "next_quarter", "season", "year"];

const away = (days: number) => (days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** The map's line for each crowd (§23.2 step 5d): its tier, new reach, momentum and next peak, by crowd index. */
export function tiersFor(run: FitsRun | undefined, crowds: CrowdCard[]): (CrowdDecision | undefined)[] {
  if (!run) return [];
  return crowds.map((c) => {
    const f = run.fits.fits.find((x) => x.crowd === c.id);
    if (!f) return undefined;
    const reach = f.params.reach?.value;
    const mom = f.params.momentum?.value;
    const peak = HORIZONS.flatMap((h) => run.calendar.horizons[h]).find((m) => m.kind === "crowd" && m.crowd === c.id);
    const line = [
      reach !== undefined ? `${people(reach)} new reach` : "",
      mom !== undefined ? `attention ${mom >= 0 ? "+" : "−"}${Math.abs(Math.round(mom * 100))}% on a year ago` : "",
      peak ? `peaks ${MONTHS[new Date(`${peak.date}T00:00:00Z`).getUTCMonth()].slice(0, 3)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return { tier: TIER_LABEL[f.tier], line, watch: f.tier === "watch" };
  });
}

type Props = {
  run?: FitsRun;
  /** The agent's steps while it ranks. */
  steps: AgentEvent[];
  running: boolean;
  asks: Asked[];
  answers: Record<string, string>;
  onAnswer: (q: Asked, answer: string) => void;
  /** A strategy for every most valuable fit (§23.2 step 6), once the fits are ranked. */
  strategy?: StrategyView;
  /** Each crowd's colour slot, by id. */
  slot: (id: string) => number;
  /** Each fit's foot: the handoffs to the specialists who work it (§23.2 step 8.3b). */
  foot?: (f: Fit) => ReactNode;
};

export function Fits({ run, steps, running, asks, answers, onAnswer, strategy, slot, foot }: Props) {
  const live = steps.filter((s) => s.why);
  if (!run)
    return (
      <section className="card fits">
        <h3>Your most valuable fits</h3>
        <ol className="steps live-steps">
          {(live.length ? live.slice(-5).map((s) => s.why) : ["Reading your context for what matters most"]).map((s, i, all) => (
            <li key={i} className={i === all.length - 1 ? "step-active" : "step-done"}>
              <span className={i === all.length - 1 ? "spin" : "tick"} aria-hidden>{i === all.length - 1 ? "" : "✓"}</span>
              <span className={i === all.length - 1 ? "shimmer-text" : ""}>{s}</span>
            </li>
          ))}
        </ol>
        {asks.map((q) => <Question key={q.id} q={q} answer={answers[q.id]} onAnswer={(a) => onAnswer(q, a)} />)}
      </section>
    );

  const sources = new Map(run.sources.map((s) => [s.id, s]));
  const { fits, answer } = run;
  const qloo = run.sources.reduce((n, s) => n + s.callIds.length, 0);
  const said = (crowd: string) => answer.reasons.filter((r) => r.crowd === crowd);
  const overall = said("");
  const name = (id?: string) => fits.fits.find((f) => f.crowd === id)?.name;
  // The strategies cite their own run's sources; while one is planned, every top fit says so.
  const plan = strategy?.run;
  const planSources = new Map((plan?.sources ?? []).map((s) => [s.id, s]));
  const planned = (crowd: string) => plan?.result.strategies.find((s) => s.crowd === crowd);
  const planning = (f: Fit) => !!strategy?.running && !planned(f.crowd) && (f.tier !== "watch" || f.rank === 1);

  return (
    <section className="card fits" aria-label="Your most valuable fits">
      <header className="card-head">
        <h3>Your most valuable fits</h3>
        <p className="small muted">
          Each crowd scored on six measures: brand fit and efficiency from Qloo, reach from the Census, momentum from Wikipedia, moments from Ticketmaster and the calendar, and how surely the crowd holds together.
          {qloo ? ` ${qloo} Qloo calls in this ranking.` : ""}
        </p>
      </header>
      {running && (
        <p className="small fits-rerun" role="status">
          <span className="spin" aria-hidden /> <span className="shimmer-text">{live.at(-1)?.why ?? "Ranking again with what you told me"}</span>
        </p>
      )}
      {answer.headline && <p className="fits-headline">{answer.headline}</p>}
      {overall.map((r, i) => (
        <p key={i} className="small">
          {r.text} <Cites ids={r.sources} sources={sources} />
        </p>
      ))}

      {TIERS.map((t) => {
        const inTier = fits.fits.filter((f) => f.tier === t);
        if (!inTier.length) return null;
        return (
          <div key={t} className={`fits-tier tier-${t}`}>
            <h4 className="crowd-tag">{TIER_LABEL[t]}</h4>
            {inTier.map((f) => (
              <FitCard key={f.crowd} f={f} said={said(f.crowd)} sources={sources} slot={slot(f.crowd)}>
                {planned(f.crowd) ? (
                  <StrategyCard s={planned(f.crowd)!} said={plan!.answer.lines.filter((l) => l.crowd === f.crowd)} sources={planSources} />
                ) : planning(f) ? (
                  <StrategyPending steps={strategy!.steps} />
                ) : null}
                {foot?.(f)}
              </FitCard>
            ))}
          </div>
        );
      })}

      {strategy && <StrategyHead view={strategy} sources={planSources} />}

      {(fits.changes.length > 0 || fits.excluded.length > 0) && (
        <div className="fits-context">
          <h4>What your context changed</h4>
          <ul className="small">
            {fits.changes.map((c) => (
              <li key={c.param}>
                <strong>{PARAM_LABEL[c.param]}</strong> counts {c.weight > 1 ? `${c.weight}×` : `${c.weight}×, less`}: {c.reason} <Cites ids={c.sources} sources={sources} />
              </li>
            ))}
            {fits.excluded.length > 0 && (
              <li>
                <strong>Already yours</strong>, so not counted as new reach: {fits.excluded.map((e) => e.metro).join("; ")} <Cites ids={[...new Set(fits.excluded.flatMap((e) => e.sources))]} sources={sources} />
              </li>
            )}
          </ul>
        </div>
      )}
      {answer.assumptions.length > 0 && (
        <p className="small muted">
          <strong>Going ahead assuming</strong> {answer.assumptions.join("; ")}
        </p>
      )}
      {asks.map((q) => <Question key={q.id} q={q} answer={answers[q.id]} onAnswer={(a) => onAnswer(q, a)} />)}

    </section>
  );
}

function FitCard({ f, said, sources, slot, children }: { f: Fit; said: FitsAnswer["reasons"]; sources: Map<string, SourceRef>; slot: number; children?: ReactNode }) {
  return (
    <article className="fit">
      <div className="fit-head">
        <span className="rank">{f.rank}</span>
        <h5>
          <span className="swatch" style={{ background: `var(--crowd-${slot})` }} aria-hidden />
          {f.name}
        </h5>
        <span className="fit-score" title="The weighted mean of the measures below, 0 to 1">{f.score.toFixed(2)}</span>
      </div>
      {f.nearMiss && <p className="crowd-tag fit-near">{NEAR_MISS_LABEL}</p>}
      {said.length
        ? said.map((r, i) => (
            <p key={i} className="small">
              {r.text} <Cites ids={r.sources} sources={sources} />
            </p>
          ))
        : f.reasons.map((r, i) => <p key={i} className="small">{r}</p>)}
      {/* When to move is the Promoter's (§23.2 step 8.5l): its calendar, not the Analyst's fits. */}
      <details className="fit-params">
        <summary className="small">The six measures</summary>
        <dl>
          {PARAMS.map((p) => {
            const m = f.params[p];
            if (!m) return null;
            const missing = f.missing.includes(p);
            return (
              <Fragment key={p}>
                <dt className="small">{PARAM_LABEL[p]}</dt>
                <dd className="small">
                  <span className="bar" aria-hidden>
                    <span style={{ width: `${Math.round((m.score ?? 0) * 100)}%` }} />
                  </span>
                  <span className={missing ? "muted" : ""}>{missing ? "Not measured for this crowd, so left out of its score" : m.text}</span>
                </dd>
              </Fragment>
            );
          })}
        </dl>
      </details>
      {children}
    </article>
  );
}

/** When (§23.2 step 5f): retail moments, category seasons and each crowd's own, across four horizons, and the yearly patterns. */
export function When({ calendar, name }: { calendar: Calendar; name: (id?: string) => string | undefined }) {
  const any = HORIZONS.some((h) => calendar.horizons[h].length);
  if (!any && !calendar.recurring.length) return null;
  return (
    <div className="fits-when">
      <h4>When</h4>
      <div className="when-grid">
        {HORIZONS.filter((h) => calendar.horizons[h].length).map((h) => (
          <div key={h}>
            <h5 className="crowd-tag">{HORIZON_LABEL[h]}</h5>
            <ul className="when-list small">
              {calendar.horizons[h].map((m, i) => <MomentLine key={`${m.name}${i}`} m={m} name={name} />)}
            </ul>
          </div>
        ))}
      </div>
      {calendar.recurring.length > 0 && (
        <>
          <h5 className="crowd-tag">Every year</h5>
          <ul className="when-list small">
            {calendar.recurring.map((r) => (
              <li key={`${r.title}${r.crowd ?? ""}`}>
                {r.crowd ? `${name(r.crowd) ?? "A crowd"} (${r.title})` : r.title} peaks in {r.peaks.map((p) => `${MONTHS[p.month]} (${p.index}× its usual month)`).join(" and ")}
                <span className="muted">, {r.years} years of Wikipedia pageviews</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MomentLine({ m, name }: { m: Moment; name: (id?: string) => string | undefined }) {
  const title = m.kind === "crowd" && m.crowd ? m.name.replace(/^[^:]+:/, `${name(m.crowd) ?? "Crowd"}:`) : m.name;
  return (
    <li>
      <span className="when-date">{day(m.date)}</span>{" "}
      {m.url ? (
        <a href={m.url} target="_blank" rel="noreferrer">
          {title}
        </a>
      ) : (
        title
      )}
      <span className="muted"> · {away(m.days)}</span>
      {m.startBy && m.lead && (
        <span className="when-lead">
          Start by {day(m.startBy)}: {m.lead.basis}
        </span>
      )}
      {m.detail && <span className="muted when-detail">{m.detail}</span>}
    </li>
  );
}
