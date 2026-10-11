import { hsrGroup } from "./hsr";
import { templateGroup } from "./templates";
import type { PresetGroup } from "./types";

export type { Preset, PresetGroup } from "./types";

/** Groups shown in the preset menu, in order. A generated data file only needs to export a PresetGroup and be listed here. */
export const presetGroups: PresetGroup[] = [templateGroup, hsrGroup];
