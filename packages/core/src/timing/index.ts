/**
 * Timing rules 1.0 (docs/spec/timing.md). Exported from @gml/core as the `Timing` namespace.
 */
export * from "./types";
export { TimingError, buildWindows, cloneTimingState, createTimingState, expandAttack, framesToMs, msToFrames, runTiming, stepTiming, traceFrame } from "./engine";
export * from "./validate";
export * from "./presets";

/** Version of docs/spec/timing.md; carried by vectors/timing.json. */
export const RULES_VERSION = "1.0.0";
