/**
 * Gacha banner data model (docs/spec/gacha.md). Plain JSON, like the battle model.
 */

/** Something a pull can give: a character (unit definition) or an amount of a resource. */
export interface GachaItem {
  id: string;
  name: string;
  kind: "unit" | "resource";
  /** kind "unit": the UnitDef id this item grants. */
  unitId?: string;
  /** kind "resource": how much of `resource` it grants. */
  amount?: number;
  /** kind "resource": resource key, e.g. "exp". */
  resource?: string;
}

/** Featured ("rate-up") split inside a tier (§2.3). */
export interface FeaturedRule {
  /** Chance that a hit of this tier is featured when not guaranteed (0..1). */
  share: number;
  /** After a non-featured hit, the next hit of this tier is featured ("big guarantee"). */
  guarantee: boolean;
  /** Featured item ids. */
  items: string[];
}

/** One rarity tier. Tiers are listed highest first; the last tier takes whatever probability is left (§2.2). */
export interface GachaTier {
  id: string;
  name: string;
  /** Base chance per pull. Ignored for the last tier. */
  rate: number;
  /** Pull count (since this tier's last hit, counting the current pull) at which the rate starts rising. */
  softPityStart?: number;
  /** Rate added per pull from softPityStart on. */
  softPityStep?: number;
  /** Pull count that always hits this tier (unless a higher tier is hit first). 0/missing = none. */
  hardPity?: number;
  featured?: FeaturedRule;
  /** Regular (non-featured) item ids. */
  items: string[];
}

export interface BannerDef {
  id: string;
  name: string;
  description?: string;
  /** Currency per pull (informational for budget tools and the demo). */
  cost: number;
  tiers: GachaTier[];
  items: GachaItem[];
}

/** Per-player banner state. Counters are pulls since the tier's last hit; they never cap. */
export interface GachaState {
  counters: Record<string, number>;
  guaranteed: Record<string, boolean>;
  pulls: number;
}

export interface PullResult {
  tierId: string;
  itemId: string;
  featured: boolean;
  /** The tier's counter value on this pull (1 = hit on the first pull since the last one). */
  pity: number;
}

export interface GachaConfig {
  banners: BannerDef[];
  /** Banner used by the demo and as the default in the tools. */
  active: string;
}
