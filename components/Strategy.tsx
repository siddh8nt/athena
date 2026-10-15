"use client";

import type { AgentEvent } from "@/lib/blocks/types";
import type { SourceRef } from "@/lib/fits/types";
import { CHANNEL_LABEL, CONTEXT_LABEL, WHEN_LABEL, type ActionWhen, type Strategy, type StrategyAnswer, type StrategyRun } from "@/lib/strategy/types";
import { Cites, day, readable } from "./Cites";

// A strategy for every most valuable fit (PRD §23.2 step 6): who, where, through what and when, built by code from
// the ranking, the calendar and the founder's context; each action says which context fact shaped it. The agent's
// sentences explain each one with its sources.

const WHENS: ActionWhen[] = ["now", "next", "before"];

export type StrategyView = { run?: StrategyRun; steps: AgentEvent[]; running: boolean };

/** One fit's strategy, inside its card. */
export function StrategyCard({ s, said, sources }: { s: Strategy; said: StrategyAnswer["lines"]; sources: Map<string, SourceRef> }) {
  const now = s.where.filter((w) => w.now);
  const later = s.where.filter((w) => !w.now);
  return (
    <div className="strategy" aria-label={`Strategy for ${s.name}`}>
      <h6 className="crowd-tag">Strategy</h6>
      {said.map((l, i) => (
        <p key={i} className="small">
          {readable(l.text)} <Cites ids={l.sources} sources={sources} />
        </p>
      ))}
      <dl className="strategy-facts small">
        <dt>Who</dt>
        <dd>
          {s.who.text} <Cites ids={s.who.sources} sources={sources} />
        </dd>
        {s.where.length > 0 && (
          <>
            <dt>Where</dt>
            <dd>
              {now.length > 0 && <span>Now: {now.map((w) => w.metro).join(", ")}</span>}
              {later.length > 0 && <span className="muted">{now.length ? " · " : ""}Then: {later.map((w) => w.metro).join(", ")}</span>} <Cites ids={[...new Set(s.where.flatMap((w) => w.sources))]} sources={sources} />
            </dd>
          </>
        )}
        <dt>Through</dt>
        <dd>{s.through.map((c) => CHANNEL_LABEL[c]).join(", ")}</dd>
      </dl>
      {WHENS.map((w) => {
        const acts = s.actions.filter((a) => a.when === w);
        if (!acts.length) return null;
        return (
          <div key={w} className="strategy-when">
            <h6 className="crowd-tag">{WHEN_LABEL[w]}</h6>
            <ul className="strategy-actions small">
              {acts.map((a) => (
                <li key={a.id}>
                  <span className="when-date">{day(a.startBy)}</span> {a.moment && <strong>{a.moment.name} ({day(a.moment.date)}): </strong>}
                  {a.text} <Cites ids={a.sources} sources={sources} />
                  {a.shapedBy.length > 0 && <span className="strategy-shaped muted"> · shaped by {a.shapedBy.map((k) => CONTEXT_LABEL[k].toLowerCase()).join(", ")}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="small muted">Who, where, retailers and creators from Qloo&apos;s taste graph for this crowd; dates from the calendar above.</p>
    </div>
  );
}

/** While a fit's strategy is being planned: the agent's latest step. */
export function StrategyPending({ steps }: { steps: AgentEvent[] }) {
  const last = steps.filter((s) => s.why).at(-1);
  return (
    <p className="small fits-rerun" role="status">
      <span className="spin" aria-hidden /> <span className="shimmer-text">{last?.why ?? "Planning who, where and when for this crowd"}</span>
    </p>
  );
}

/** The strategies' headline, the sentences about all of them, and what the founder's context changed. */
export function StrategyHead({ view, sources }: { view: StrategyView; sources: Map<string, SourceRef> }) {
  const run = view.run;
  if (!run) return null;
  const overall = run.answer.lines.filter((l) => !l.crowd);
  const assumed = [...new Set([...run.result.assumed, ...run.answer.assumptions].map((a) => a.trim().replace(/[.;]+$/, "")).filter(Boolean))];
  return (
    <div className="fits-context strategy-head">
      <h4>Your strategies</h4>
      {view.running && <StrategyPending steps={view.steps} />}
      {run.answer.headline && <p className="fits-headline">{readable(run.answer.headline)}</p>}
      {overall.map((l, i) => (
        <p key={i} className="small">
          {readable(l.text)} <Cites ids={l.sources} sources={sources} />
        </p>
      ))}
      {run.result.context.length > 0 && (
        <>
          <h5 className="crowd-tag">What your context changed</h5>
          <ul className="small">
            {run.result.context.map((c, i) => (
              <li key={i}>
                <strong>{CONTEXT_LABEL[c.key]}</strong>: {c.text} <Cites ids={c.sources} sources={sources} />
              </li>
            ))}
          </ul>
        </>
      )}
      {assumed.length > 0 && (
        <p className="small muted">
          <strong>Going ahead assuming</strong> {assumed.join("; ")}
        </p>
      )}
    </div>
  );
}
