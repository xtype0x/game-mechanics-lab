/**
 * Timing rules 1.1 (docs/spec/timing.md). Exported from @gml/core as the `Timing` namespace.
 */
export * from "./types";
export { TimingError, buildWindows, cloneTimingState, createTimingState, expandAttack, framesToMs, hitTelegraph, msToFrames, rebaseTimingState, runTiming, stepTiming, traceFrame } from "./engine";
export * from "./validate";
export * from "./presets";

/** Version of docs/spec/timing.md; carried by vectors/timing.json. */
export const RULES_VERSION = "1.1.0";
