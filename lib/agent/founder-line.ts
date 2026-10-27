/** The founder's line in an ask: "I'm the founder of X." plus what it makes, whether the Brand Graph holds a phrase
 * ("olive oil") or a whole sentence that already names the brand ("Brightland sells premium olive oils…", or
 * "Fishwife sells…" for Fishwife Tinned Seafood Co.). Client-safe, so the Executive's template drafts use it too. */
export function founderLine(brand: string, product: string): string {
  const p = product.trim().replace(/[.\s]+$/, "");
  const first = brand.trim().split(/\s+/)[0] ?? "";
  const sentence = p.toLowerCase().startsWith(`${brand.toLowerCase()} `) || (first.length > 2 && p.startsWith(`${first} `));
  const made = !p || p.toLowerCase() === brand.toLowerCase() ? "" : sentence ? ` ${p}.` : ` We make ${p}.`;
  return `I'm the founder of ${brand}${/[.!?]$/.test(brand) ? "" : "."}${made}`;
}
