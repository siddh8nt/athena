// Allow-lists (PRD §9.2, §9.17, §15). Code constants with tests; nothing outside them is shown or stored.
// Tag type names are the ones Qloo returned on 8 Oct.

/** Fingerprint tag types for venue signals: ambience, setting, good-for, decor, cuisine, dining, menu, dishes, amenities, service. */
export const VENUE_FINGERPRINT_TYPES = [
  "urn:tag:ambience:qloo",
  "urn:tag:ambience:place",
  "urn:tag:setting:qloo",
  "urn:tag:good_for:qloo",
  "urn:tag:decor:qloo",
  "urn:tag:cuisine:qloo",
  "urn:tag:culinary_style:qloo",
  "urn:tag:dining_options:place",
  "urn:tag:dining_option:qloo",
  "urn:tag:menu_highlight:qloo",
  "urn:tag:specialty_dish:place",
  "urn:tag:beverage_offering:qloo",
  "urn:tag:amenity:qloo",
  "urn:tag:amenities:place",
  "urn:tag:service_options:place",
] as const;

/** Fingerprint tag types for brand signals: genres, keywords, brand style and personality. */
export const BRAND_FINGERPRINT_TYPES = [
  "urn:tag:genre:brand",
  "urn:tag:genre:music",
  "urn:tag:genre:media",
  "urn:tag:genre:place",
  "urn:tag:keyword:qloo",
  "urn:tag:aesthetic_property:qloo",
  "urn:tag:emotional_tone:qloo",
  "urn:tag:design_inspiration:qloo",
  "urn:tag:personal_style:qloo",
  "urn:tag:lifestyle:qloo",
] as const;

/** Brand-style family used with themes for positioning pools (§9.16). */
export const POSITIONING_TYPES = [
  "urn:tag:theme:qloo",
  "urn:tag:aesthetic_property:qloo",
  "urn:tag:emotional_tone:qloo",
  "urn:tag:core_value:qloo",
] as const;

/** Never shown or stored, whatever the call (§9.2, §15). Prefix match. */
export const NEVER_TAG_PREFIXES = [
  "urn:tag:customer_identity",
  "urn:tag:neighborhood_characteristic",
  "urn:tag:age_range",
  "urn:tag:inclusivity",
  "urn:tag:wikipedia_category",
  "urn:tag:customer_segment",
  "urn:tag:target_age_group",
  "urn:tag:target_gender",
  "urn:tag:target_income_level",
  "urn:tag:not_for_display",
  "urn:audience",
] as const;

const POLITICAL_OR_RELIGIOUS = /\b(politic|religio|church|christian|muslim|islam|jewish|judais|hindu|buddhis|spiritual|conservative|liberal|progressive|republican|democrat)/i;

export function tagType(tag: { type?: string; subtype?: string; id?: string; tag_id?: string }): string {
  if (tag.subtype) return tag.subtype;
  if (tag.type && tag.type !== "urn:tag") return tag.type;
  const id = tag.id ?? tag.tag_id ?? "";
  return id.split(":").slice(0, 4).join(":");
}

export function isAllowedTag(tag: { type?: string; subtype?: string; id?: string; tag_id?: string; name?: string }, allowed: readonly string[]): boolean {
  const t = tagType(tag);
  const id = tag.id ?? tag.tag_id ?? "";
  if (NEVER_TAG_PREFIXES.some((p) => t.startsWith(p) || id.startsWith(p))) return false;
  if (POLITICAL_OR_RELIGIOUS.test(tag.name ?? "") || POLITICAL_OR_RELIGIOUS.test(id)) return false;
  return allowed.includes(t);
}

/** Audience interests (§9.17): only these four audience types are ever shown. */
export const ALLOWED_AUDIENCE_TYPES = [
  "urn:audience:hobbies_and_interests",
  "urn:audience:leisure",
  "urn:audience:spending_habits",
  "urn:audience:professional_area",
] as const;

export const ALL_AUDIENCE_TYPES = [
  "urn:audience:communities",
  "urn:audience:global_issues",
  "urn:audience:hobbies_and_interests",
  "urn:audience:investing_interests",
  "urn:audience:leisure",
  "urn:audience:life_stage",
  "urn:audience:lifestyle_preferences_beliefs",
  "urn:audience:political_preferences",
  "urn:audience:professional_area",
  "urn:audience:spending_habits",
] as const;

/** Names that stay hidden even inside an allowed audience type (8 Oct: "Political Junkie" is typed leisure). */
export function isAllowedAudienceName(name: string): boolean {
  return !POLITICAL_OR_RELIGIOUS.test(name) && !/\b(politic|activis|lgbt|latino|black|asian|ethnic|faith|church)/i.test(name);
}

export function isAllowedAudienceType(type: string | undefined): boolean {
  return !!type && (ALLOWED_AUDIENCE_TYPES as readonly string[]).includes(type);
}

/** The fixed label shown with the skew chart and the interest chips (§9.17). Never edit without the PRD. */
export const AUDIENCE_LABEL =
  "Aggregate taste-panel signal from Qloo, relative to average. It describes people who share this taste, not your customers. Not for targeting.";

/** Banned in product copy (§13.9); a test scans UI strings. */
export const BANNED_WORDS = [
  "predicts",
  "will stock",
  "likely to buy",
  "guaranteed",
  "insights",
  "AI-powered",
  "leverage",
  "seamless",
  "unlock",
  "revolutionise",
  "synergy",
] as const;
