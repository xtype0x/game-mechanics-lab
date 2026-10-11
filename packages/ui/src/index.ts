// @gml/ui — React components shared by the apps and projects. Depends only on @gml/core and React.
// Styling: components use plain class names; apps style editors themselves. The battle scene ships its own CSS:
// import "@gml/ui/scene.css" and "@gml/ui/demo.css" once in the page that shows <BattleScene>.

export * from "./base";
export type { MountProject, ProjectHost } from "./host";

export * from "./battle/common";
export * from "./battle/elements";
export * from "./battle/meta";
export { ActionOrder } from "./battle/ActionOrder";
export { BatchSim } from "./battle/BatchSim";
export { PassiveList, SkillList, refLabel } from "./battle/SkillEditor";
export { CharacterEditor, CharacterPreview, type CharacterFocus, type CharacterTab } from "./battle/CharacterEditor";

export { BattleScene, type BattleOutcome } from "./scene/BattleScene";
export { Particles, type BurstKind } from "./scene/particles";
export { Backdrop, type Theme } from "./scene/art/Backdrop";
export { Sprite, ELEMENT_COLORS, elementColor, generatedLook, spriteScale } from "./scene/art/Sprite";
export { Hero, type Extra, type HairStyle, type HeroLook, type Weapon } from "./scene/art/Hero";
export { Bat, Colossus, Golem, Sentinel, Slime } from "./scene/art/Monsters";

// Timing components (editor, frame bar, log). Import "@gml/ui/timing.css" once in the host page.
export * from "./timing";
