import { describe, expect, it } from "vitest";
import { parseSeedInput } from "../src/battle/common";

describe("parseSeedInput", () => {
  it("turns digit-only text into a number seed", () => {
    expect(parseSeedInput("12345")).toBe(12345);
    expect(parseSeedInput("0")).toBe(0);
  });
  it("keeps any other text as a string seed", () => {
    // The site's old field tested /^d+$/ (missing backslash), so "12345" stayed a string and "ddd" became NaN.
    expect(parseSeedInput("ddd")).toBe("ddd");
    expect(parseSeedInput("12a")).toBe("12a");
    expect(parseSeedInput("")).toBe("");
    expect(parseSeedInput("-3")).toBe("-3");
  });
});
