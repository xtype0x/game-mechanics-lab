import { hsrGroup, type PresetGroup } from "@gml/data-hsr/presets";
import { templateGroup } from "./templates";

export type { Preset, PresetGroup } from "@gml/data-hsr/presets";

/** Groups shown in the preset menu, in order. A generated data file only needs to export a PresetGroup and be listed here. */
export const presetGroups: PresetGroup[] = [templateGroup, hsrGroup];
