// Specificity (PRD §9.23, v4.0: E3): how much more this crowd ranks an entity than its general popularity predicts.
// Qloo's `popularity` is a percentile within the entity's domain, so unlike affinity it can be compared across
// queries. Per domain, a least-squares line of percentile on logit(popularity); the residual is the specificity.
// Positive: loved here more than its fame explains. No Qloo calls.

const logit = (p: number) => {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
};

/** Residuals of y on logit(popularity), fitted per domain. Entities without popularity, or domains with < 4 of them, get 0. */
export function specificity(items: { domain: string; popularity?: number }[], y: number[]): number[] {
  const out = new Array<number>(items.length).fill(0);
  const domains = [...new Set(items.map((x) => x.domain))];
  for (const d of domains) {
    const idx = items.map((x, i) => (x.domain === d && typeof x.popularity === "number" ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 4) continue;
    const xs = idx.map((i) => logit(items[i].popularity!));
    const ys = idx.map((i) => y[i]);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
    const slope = sxx > 1e-12 ? xs.reduce((s, v, t) => s + (v - mx) * (ys[t] - my), 0) / sxx : 0;
    idx.forEach((i, t) => (out[i] = ys[t] - (my + slope * (xs[t] - mx))));
  }
  return out;
}
