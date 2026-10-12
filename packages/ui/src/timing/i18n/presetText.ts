// Shape of a per-locale translation table for the core's built-in timing presets (@gml/core Timing.TIMING_PRESETS).
// Keyed by preset id, then item id. Anything missing falls back to the core's own (Chinese) text.

export interface PresetInteractionText {
  name?: string;
  /** Window id -> name. */
  windows?: Record<string, string>;
}

export interface PresetText {
  name?: string;
  description?: string;
  /** Item id -> name. */
  tags?: Record<string, string>;
  resources?: Record<string, string>;
  statuses?: Record<string, string>;
  outcomes?: Record<string, string>;
  interactions?: Record<string, PresetInteractionText>;
}

export type PresetTable = Record<string, PresetText>;
