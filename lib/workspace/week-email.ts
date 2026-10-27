import { niceDay, rowHref, weekText, type Week, type WeekLine } from "./week";

// The This week email (PRD §23.6 j): the same three lists as Overview, with the serif heading and the 16px cards as
// far as mail clients allow (tables and inline styles; no web fonts, no CSS classes). Each line links to its row in
// the founder's Athena when `base` is given, else to its source.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const INK = "#1f1b16";
const MUTED = "#6b645a";
const LINE = "#e4dfd4";

function card(l: WeekLine, base?: string): string {
  const href = l.row && base ? rowHref(l.row, base) : l.url;
  const inner = `<div style="font:600 15px/1.35 ${SANS};color:${INK}">${esc(l.title)}</div><div style="font:13px/1.45 ${SANS};color:${MUTED};margin-top:2px">${esc(l.sub)}</div>`;
  const body = href ? `<a href="${esc(href)}" style="text-decoration:none;color:${INK};display:block">${inner}</a>` : inner;
  return `<tr><td style="padding:0 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:16px;background:#ffffff"><tr><td style="padding:12px 16px">${body}</td></tr></table></td></tr>`;
}

function part(head: string, ls: WeekLine[], base?: string): string {
  if (!ls.length) return "";
  return `<tr><td style="padding:18px 0 8px;font:600 11px/1 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(head)}</td></tr>${ls.map((l) => card(l, base)).join("")}`;
}

export function weekSubject(w: Week): string {
  const n = w.quiet.length + w.due.length;
  return `${w.brand}: this week${n ? ` (${n} to do)` : ""}`;
}

export function weekHtml(w: Week, opts: { base?: string; note?: string } = {}): string {
  const lists = part("No reply yet", w.quiet, opts.base) + part("Due this week", w.due, opts.base) + part("Next events", w.events, opts.base);
  const empty = `<tr><td style="padding:16px 0;font:14px/1.5 ${SANS};color:${MUTED}">Nothing falls due this week, and no pitch is waiting on a reply.</td></tr>`;
  const foot = [opts.note, opts.base ? `<a href="${esc(`${opts.base}/plan`)}" style="color:${MUTED}">Open Athena</a>` : ""].filter(Boolean).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(weekSubject(w))}</title></head>
<body style="margin:0;padding:0;background:#f6f3ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="font:600 11px/1 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${MUTED};padding-bottom:8px">Athena · ${esc(niceDay(w.today))}</td></tr>
<tr><td style="font:400 28px/1.2 ${SERIF};color:${INK};padding-bottom:4px">${esc(w.brand)}: this week</td></tr>
${lists || empty}
${foot ? `<tr><td style="padding-top:16px;font:12px/1.5 ${SANS};color:${MUTED}">${foot}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

export const weekMailText = (w: Week, opts: { base?: string; note?: string } = {}) => weekText(w, opts.base) + (opts.note ? `\n${opts.note}\n` : "");
