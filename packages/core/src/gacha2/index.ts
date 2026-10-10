/**
 * Gacha rules 2.0 (docs/spec/gacha2.md). Exported from @ggt/core as the `Gacha` namespace.
 */
export * from "./model";
export { GachaModelError, exchange, newState, nextVars, pull, pullContext, pullMany, stateVars, tierRate, type PullContext } from "./engine";
export * from "./chain";
export * from "./stats";
export * from "./cost";
export * from "./presets";

/** Version of docs/spec/gacha2.md; carried by vectors/gacha2.json. */
export const RULES_VERSION = "2.2.0";
