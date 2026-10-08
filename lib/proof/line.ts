import type { PlacesComparison } from "./without-qloo";

/** The landing line (§2.2, decided 8 Oct): unverified picks and taste fit lead; "most popular" stays on the Method page. */
export function comparisonLine(c: PlacesComparison, athenaCount: number): string | undefined {
  const n = c.llm.length;
  if (!n) return undefined;
  const unverified = c.llm.filter((v) => v.status !== "found").length;
  const rank = c.metrics.tasteFitMedianRank;
  const parts = [`Same question, with and without Qloo: of the chatbot's ${n} venues, ${unverified} ${unverified === 1 ? "is" : "are"} closed or couldn't be verified in Qloo`];
  if (rank !== undefined && c.metrics.poolSize) parts.push(`and the rest rank #${Math.round(rank)} of ${c.metrics.poolSize} on your crowd's taste in Qloo`);
  return `${parts.join(", ")}. Every one of Athena's ${athenaCount} carries Qloo evidence.`;
}
