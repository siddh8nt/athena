// Playbook = Category × Tier × Stage × Motions → one PlaybookConfig (PRD §7.1–7.6).

export type Motion = "venue" | "retail" | "city_launch" | "partnership" | "location_opening" | "online";
export type Block = "markets" | "places" | "partners" | "message" | "moments" | "act";
export type Tier = "mass" | "mainstream" | "premium" | "luxury";
export type Stage = "prelaunch" | "early" | "scaling";
export type CategoryId =
  | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8"
  | "T1" | "T2" | "T3" | "A1" | "A2" | "A3" | "A4" | "L1";
export type RecipeId = "R1" | "R2" | "R3" | "R4" | "R5";
export type DraftKind = "venue_pitch" | "buyer_pitch" | "event_inquiry" | "collab_inquiry" | "sponsorship_inquiry";

const P = "urn:tag:genre:place:";
/** Venue-type tags confirmed on 8 Oct (S3, §7.3): ≥ 20 venues in NYC, LA and Chicago unless noted. */
export const VENUE_TAGS = {
  cafe: `${P}restaurant:cafe`,
  coffee_shop: `${P}restaurant:coffee_shop`,
  bakery: `${P}restaurant:bakery`,
  brunch: `${P}restaurant:brunch`,
  deli: `${P}restaurant:deli`,
  cheese_shop: `${P}restaurant:cheese_shop`,
  health_food: `${P}restaurant:health_food`,
  gift_shop: `${P}gift_shop`,
  home_goods_store: `${P}home_goods_store`,
  grocery_store: `${P}grocery_store`,
  gourmet_grocery_store: `${P}gourmet_grocery_store`, // Chicago 18
  gym: `${P}gym`,
  spa: `${P}spa`,
  art_gallery: `${P}art_gallery`,
  wine_store: `${P}wine_store`,
  festival: `${P}festival`,
} as const;
export type VenueType = keyof typeof VENUE_TAGS;

export const VENUE_LABELS: Record<VenueType, string> = {
  cafe: "Cafés",
  coffee_shop: "Coffee shops",
  bakery: "Bakeries",
  brunch: "Brunch spots",
  deli: "Delis",
  cheese_shop: "Cheese shops",
  health_food: "Health-food spots",
  gift_shop: "Gift shops",
  home_goods_store: "Home goods stores",
  grocery_store: "Grocery stores",
  gourmet_grocery_store: "Gourmet grocers",
  gym: "Gyms",
  spa: "Spas",
  art_gallery: "Art galleries",
  wine_store: "Wine stores",
  festival: "Festivals",
};

export type Category = {
  id: CategoryId;
  name: string;
  motions: Motion[];
  channels: VenueType[];
  partnerTypes: ("brand" | "podcast")[];
  status: "tuned" | "beta" | "out_of_scope";
};

// Only confirmed tags are used; channels marked * in §7.3 are left out until checked.
export const CATEGORIES: Record<CategoryId, Category> = {
  G1: { id: "G1", name: "Packaged food and snacks", motions: ["venue", "retail"], channels: ["gift_shop", "gourmet_grocery_store", "grocery_store", "cafe", "coffee_shop", "bakery", "deli", "cheese_shop"], partnerTypes: ["brand", "podcast"], status: "tuned" },
  G2: { id: "G2", name: "Non-alcoholic drinks", motions: ["venue"], channels: ["cafe", "coffee_shop", "brunch", "health_food", "gym", "grocery_store"], partnerTypes: ["brand", "podcast"], status: "tuned" },
  G3: { id: "G3", name: "Beauty and personal care", motions: ["retail", "partnership"], channels: ["spa", "gift_shop"], partnerTypes: ["brand", "podcast"], status: "beta" },
  G4: { id: "G4", name: "Home and lifestyle", motions: ["retail", "partnership"], channels: ["gift_shop", "home_goods_store", "art_gallery", "cafe"], partnerTypes: ["brand", "podcast"], status: "tuned" },
  G5: { id: "G5", name: "Fashion and accessories", motions: ["retail", "partnership"], channels: ["gift_shop"], partnerTypes: ["brand", "podcast"], status: "beta" },
  G6: { id: "G6", name: "Wellness products (non-medical)", motions: ["venue", "partnership"], channels: ["gym", "spa", "health_food"], partnerTypes: ["brand", "podcast"], status: "beta" },
  G7: { id: "G7", name: "Pet", motions: ["retail", "venue"], channels: ["cafe"], partnerTypes: ["brand"], status: "beta" },
  G8: { id: "G8", name: "Baby and kids", motions: ["retail", "partnership"], channels: ["cafe", "gift_shop"], partnerTypes: ["brand"], status: "beta" },
  T1: { id: "T1", name: "Consumer hardware", motions: ["partnership", "retail"], channels: ["art_gallery", "coffee_shop"], partnerTypes: ["brand", "podcast"], status: "tuned" },
  T2: { id: "T2", name: "Accessories and peripherals", motions: ["partnership", "retail"], channels: ["coffee_shop"], partnerTypes: ["brand", "podcast"], status: "beta" },
  T3: { id: "T3", name: "Personal mobility", motions: ["city_launch", "partnership"], channels: ["cafe", "gym"], partnerTypes: ["brand"], status: "beta" },
  A1: { id: "A1", name: "City-launch apps", motions: ["city_launch"], channels: ["cafe", "brunch", "art_gallery"], partnerTypes: ["brand", "podcast"], status: "tuned" },
  A2: { id: "A2", name: "Lifestyle subscription apps", motions: ["partnership", "city_launch"], channels: ["gym", "cafe"], partnerTypes: ["brand", "podcast"], status: "beta" },
  A3: { id: "A3", name: "Media and entertainment apps", motions: ["partnership"], channels: ["art_gallery", "cafe"], partnerTypes: ["brand", "podcast"], status: "beta" },
  A4: { id: "A4", name: "Utility and productivity apps", motions: [], channels: [], partnerTypes: [], status: "out_of_scope" },
  L1: { id: "L1", name: "Brands opening their own sites", motions: ["location_opening"], channels: ["cafe", "coffee_shop", "gift_shop"], partnerTypes: ["brand"], status: "beta" },
};

/** Recipe channels override the category's for event and pop-up recipes (§9.5). */
export const RECIPE_CHANNELS: Partial<Record<RecipeId, VenueType[]>> = {
  R2: ["cafe", "brunch", "art_gallery"],
  R3: ["art_gallery", "coffee_shop", "gift_shop"],
};

/** Tier parameters (§7.4) for places calls. */
export function tierParams(tier: Tier): Record<string, string | number> {
  switch (tier) {
    case "mass":
      return { "filter.price_level.min": 1, "filter.price_level.max": 2, "filter.popularity.min": 0.5 };
    case "mainstream":
      return { "filter.price_level.min": 1, "filter.price_level.max": 3, "filter.popularity.min": 0.3, "bias.quality": "low", "filter.properties.business_rating.min": 3.5 };
    case "premium":
      return { "filter.price_level.min": 2, "filter.price_level.max": 4, "bias.quality": "medium", "filter.properties.business_rating.min": 4.0 };
    case "luxury":
      return { "filter.price_level.min": 3, "filter.price_level.max": 4, "bias.quality": "high", "filter.properties.business_rating.min": 4.3 };
  }
}

export const RECIPES: Record<RecipeId, { motions: Motion[]; blocks: Block[]; drafts: DraftKind[]; stages: string[] }> = {
  R1: { motions: ["venue", "retail"], blocks: ["markets", "places", "partners", "message", "moments", "act"], drafts: ["venue_pitch", "buyer_pitch", "collab_inquiry"], stages: ["Target", "Contacted", "Sampling", "Stocked", "Reordering"] },
  R2: { motions: ["city_launch"], blocks: ["markets", "places", "moments", "partners", "message", "act"], drafts: ["event_inquiry", "collab_inquiry"], stages: ["Target", "Contacted", "Booked", "Hosted", "Rebooked"] },
  R3: { motions: ["partnership"], blocks: ["partners", "message", "moments", "markets", "places", "act"], drafts: ["collab_inquiry", "sponsorship_inquiry"], stages: ["Target", "Contacted", "In talks", "Live", "Renewed"] },
  R4: { motions: ["location_opening"], blocks: ["markets", "places", "act"], drafts: [], stages: ["Shortlisted", "Visited", "Chosen"] },
  // v3.0 (§7.6): online brands. The Online stop (§9.24) sits outside the six blocks; the blocks it leans on are these.
  R5: { motions: ["online"], blocks: ["partners", "message", "moments", "act"], drafts: ["collab_inquiry", "sponsorship_inquiry"], stages: ["Target", "Contacted", "In talks", "Live", "Renewed"] },
};

export function recipeFor(motion: Motion): RecipeId {
  if (motion === "venue" || motion === "retail") return "R1";
  if (motion === "city_launch") return "R2";
  if (motion === "partnership") return "R3";
  if (motion === "online") return "R5";
  return "R4";
}

/** Several motions: blocks merge in motion order, each once; the first motion leads (§7.6). */
export function blocksFor(motions: Motion[]): Block[] {
  const out: Block[] = [];
  for (const motion of motions) for (const b of RECIPES[recipeFor(motion)].blocks) if (!out.includes(b)) out.push(b);
  // Act always closes the plan.
  return [...out.filter((b) => b !== "act"), "act"];
}

export function stageFor(accounts: number, motions: Motion[]): Stage {
  if (!motions.some((x) => x === "venue" || x === "retail")) return "early";
  return accounts === 0 ? "prelaunch" : accounts < 10 ? "early" : "scaling";
}

/** Partner reach window (§7.5): pre-launch and early cap popularity at 0.97; scaling has no cap. */
export function reachWindow(stage: Stage): Record<string, number> {
  return stage === "scaling" ? {} : { "filter.popularity.max": 0.97 };
}

export type Signal = {
  accounts: string[];
  wins: string[];
  declines: string[];
  brand?: string;
  comparables: string[];
  tags: string[];
  /** v3.0: the crowd the founder chose (§9.23 step 7). It replaces the brand and comparables wherever they'd be used. */
  crowd?: string[];
  /** v4.0: the chosen crowd's brand members, strongest first; Markets scores each city on them (§9.3). */
  crowdBrands?: string[];
};

export type PlaybookConfig = {
  brandName: string;
  category: CategoryId;
  status: "tuned" | "beta";
  tier: Tier;
  stage: Stage;
  motions: Motion[];
  recipe: RecipeId;
  blocks: Block[];
  signal: Signal;
  placeChannels: string[];
  partnerTypes: ("brand" | "podcast")[];
  tierParams: Record<string, string | number>;
  partnerParams: Record<string, number>;
  competitors: string[];
  homeMetro?: string;
  targetMetro: string;
  exclude: string[];
  draftKind: DraftKind;
  pipelineStages: string[];
  signalPolicy: SignalPolicy;
};

/**
 * Signal policy (§7.5, decided 8 Oct). "brand-led" (default): Markets, Partners, Message and Moments use
 * the brand entity plus comparables when the brand is in Qloo; Places and the Read card keep the accounts.
 * "accounts-only" is the earlier rule, kept for comparison runs.
 */
export type SignalPolicy = "accounts-only" | "brand-led";
const BRAND_LED_BLOCKS = new Set(["markets", "partners", "message", "moments"]);

export function blockSignal(pb: PlaybookConfig, block: string): string[] {
  if (pb.signal.crowd?.length && BRAND_LED_BLOCKS.has(block)) return pb.signal.crowd.slice(0, 50);
  if (pb.signalPolicy === "brand-led" && pb.signal.brand && BRAND_LED_BLOCKS.has(block)) {
    return [pb.signal.brand, ...pb.signal.comparables].slice(0, 50);
  }
  return signalIds(pb.signal, pb.stage);
}

/** The entity IDs that make up the signal for this stage (§7.5), capped at 50. */
export function signalIds(s: Signal, stage: Stage): string[] {
  const brandSide = (s.crowd?.length ? s.crowd : [s.brand, ...s.comparables]).filter(Boolean) as string[];
  const ids = stage === "scaling" ? [...s.accounts, ...s.wins] : [...s.accounts, ...s.wins, ...brandSide];
  return [...new Set(ids.length ? ids : brandSide)].slice(0, 50);
}

export function buildPlaybook(input: {
  brandName: string;
  category: CategoryId;
  tier: Tier;
  motions?: Motion[];
  signal: Signal;
  competitors?: string[];
  homeMetro?: string;
  targetMetro: string;
  signalPolicy?: SignalPolicy;
}): PlaybookConfig {
  const cat = CATEGORIES[input.category];
  if (cat.status === "out_of_scope") throw new Error(`${cat.name} is out of scope`);
  const motions = input.motions?.length ? input.motions : cat.motions;
  const recipe = recipeFor(motions[0]);
  const stage = stageFor(input.signal.accounts.length, motions);
  const channels = RECIPE_CHANNELS[recipe] ?? cat.channels;
  const exclude = [...input.signal.accounts, ...input.signal.wins, ...input.signal.declines, ...(input.signal.brand ? [input.signal.brand] : []), ...(input.competitors ?? [])];
  return {
    brandName: input.brandName,
    category: input.category,
    status: cat.status,
    tier: input.tier,
    stage,
    motions,
    recipe,
    blocks: blocksFor(motions),
    signal: input.signal,
    placeChannels: channels.map((c) => VENUE_TAGS[c]),
    partnerTypes: cat.partnerTypes,
    tierParams: tierParams(input.tier),
    partnerParams: reachWindow(stage),
    competitors: input.competitors ?? [],
    homeMetro: input.homeMetro,
    targetMetro: input.targetMetro,
    exclude: [...new Set(exclude)],
    draftKind: RECIPES[recipe].drafts[0] ?? "collab_inquiry",
    pipelineStages: RECIPES[recipe].stages,
    signalPolicy: input.signalPolicy ?? "brand-led",
  };
}
