import { FPS } from "./config";

/** World frames to seconds. */
export const stepsOf = (frames: number): number => frames / FPS;

/** "KeyJ" -> "J", "Space" -> "空白". */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "空白";
  if (code.startsWith("Shift")) return "Shift";
  return code;
}
