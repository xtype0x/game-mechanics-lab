import { describe, expect, it } from "vitest";
import { ProjectError, SCHEMA_VERSION, loadProject, newProject } from "../src";

describe("project file", () => {
  it("round-trips through JSON", () => {
    const p = newProject("測試");
    expect(loadProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it("rejects newer schema, missing version and malformed content", () => {
    const p = newProject();
    expect(() => loadProject({ ...p, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/比工具新/);
    expect(() => loadProject({ name: "x" })).toThrow(ProjectError);
    expect(() => loadProject(null)).toThrow(ProjectError);
    const bad = JSON.parse(JSON.stringify(p));
    bad.damage.config.customSteps = [{ id: "x", base: { op: "eval", args: [] } }];
    expect(() => loadProject(bad)).toThrow(/不支援的運算子/);
  });
});
