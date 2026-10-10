import type { BattleSetup, BattleState } from "@ggt/core";

/** Console → demo: ask the app shell to open the demo replaying a battle. */
export interface ReplayRequest {
  setup: BattleSetup;
  final: BattleState;
}

const EVENT = "ggt:replay";

export function openReplay(r: ReplayRequest) {
  window.dispatchEvent(new CustomEvent<ReplayRequest>(EVENT, { detail: r }));
}

export function onReplay(fn: (r: ReplayRequest) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<ReplayRequest>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

const OPEN = "ggt:open-demo";

/** Console → demo: ask the app shell to open the demo (e.g. after changing its modules). */
export function openDemo() {
  window.dispatchEvent(new Event(OPEN));
}

export function onOpenDemo(fn: () => void): () => void {
  window.addEventListener(OPEN, fn);
  return () => window.removeEventListener(OPEN, fn);
}
