// How well a thing fits a crowd, as one scale every subagent shares and the page reads (no server code, so the client
// can import it).

/** A crowd counts as fitting a shop at this strength or above (0–1, from the shop's rank for that crowd): the top half
 * of the crowd's list, so "fits several crowds" means a shop near the top for each. */
export const FITS = 0.5;

/** A fit strength as a word: "Strong", "Fits", or "—" when it doesn't fit. */
export const strengthWord = (v?: number) => (v === undefined || v < FITS ? "—" : v >= 0.7 ? "Strong" : "Fits");
