// Sample-brand packs (PRD §7.7, decided 10 Oct): real brands, built only from public material (each brand's own
// website and public store locator) plus a one-line description in our own words. Nothing is made up about any
// company; each pack is labelled "Built from public info; not affiliated with [brand]". Picking a pack fills the
// journey's first message; the visitor presses send and everything after that runs live.

export type Pack = {
  slug: string;
  name: string;
  /** What it sells, shown after the name wherever the sample is named ("Fishwife tinned fish"). */
  product: string;
  /** What the pack shows, for the /start card. */
  shows: string;
  /** What's in it, for the /start card. */
  contents: string;
  /** The first message, in our own words, with the brand's public links. */
  message: string;
};

export const PACKS: Pack[] = [
  {
    slug: "brightland",
    name: "Brightland",
    product: "olive oil",
    shows: "Offline path · Qloo knows the brand · indie stockists",
    contents: "Website · public store locator",
    message: "Brightland: olive oil and pantry goods with design-led bottles. Sold on its own site and in independent shops. brightland.co, store list at brightland.co/pages/store-locator",
  },
  {
    slug: "starface",
    name: "Starface",
    product: "pimple patches",
    shows: "Online path · Gen Z crowd · creators",
    contents: "Website · public store locator",
    message: "Starface: playful pimple patches and skincare. Sells mostly online, plus national chains. starface.world, store list at starface.world/pages/where-to-shop",
  },
  {
    slug: "fishwife",
    name: "Fishwife",
    product: "tinned fish",
    shows: "Not in Qloo yet · read through brands like it · retail step-up",
    contents: "Website · public store locator",
    message: "Fishwife: tinned seafood with illustrated packaging. Sold online and in independent shops and grocers. eatfishwife.com, store list at eatfishwife.com/pages/store-locator",
  },
];

export const packBySlug = (slug: string | null | undefined) => PACKS.find((p) => p.slug === slug);
