// Enforces the dependency rules in CLAUDE.md ("依賴方向") by reading every import in the workspaces.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
type Group = "packages" | "apps" | "projects";
interface Workspace { group: Group; dir: string; name: string; deps: Set<string> }

const workspaces: Workspace[] = (["packages", "apps", "projects"] as const).flatMap((group) =>
  existsSync(join(root, group))
    ? readdirSync(join(root, group)).filter((d) => existsSync(join(root, group, d, "package.json"))).map((d) => {
        const pkg = JSON.parse(readFileSync(join(root, group, d, "package.json"), "utf8"));
        return { group, dir: join(root, group, d), name: pkg.name as string, deps: new Set(Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) };
      })
    : [],
);
const byName = new Map(workspaces.map((w) => [w.name, w]));

/** May `from` import workspace `to`? See CLAUDE.md. */
function allowed(from: Workspace, to: Workspace): boolean {
  if (from === to) return true;
  if (to.name === "@gml/core") return true;                       // everyone may use the core
  if (from.name === "@gml/core") return false;                    // the core depends on nothing
  if (to.group === "packages") return true;                        // other shared packages
  if (to.group === "projects") return from.name === "@gml/site";   // only the site hosts projects
  return false;                                                     // nobody imports an app
}

const SKIP = new Set(["node_modules", "dist", "offline", "vectors"]);
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (SKIP.has(f)) return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx|mts|mjs)$/.test(f) && !f.endsWith(".d.mts") ? [p] : [];
  });
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm;

describe("architecture", () => {
  it("finds the workspaces", () => {
    expect(byName.has("@gml/core")).toBe(true);
    expect(byName.has("@gml/site")).toBe(true);
  });

  for (const w of workspaces) {
    it(`${w.name} only imports what it may, through package names it declares`, () => {
      const problems: string[] = [];
      for (const file of sources(w.dir)) {
        const text = readFileSync(file, "utf8");
        const at = relative(root, file);
        for (const m of text.matchAll(IMPORT_RE)) {
          const spec = m[1] ?? m[2] ?? m[3]!;
          if (spec.startsWith(".")) {
            const target = resolve(dirname(file), spec);
            if (!(target + sep).startsWith(w.dir + sep)) problems.push(`${at}: "${spec}" reaches outside ${w.name}; import the package instead`);
            continue;
          }
          const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
          const to = byName.get(pkg);
          if (!to) continue; // third-party (react, vite…) or node built-ins
          if (!allowed(w, to)) problems.push(`${at}: ${w.name} may not import ${pkg}`);
          else if (to !== w && !w.deps.has(pkg)) problems.push(`${at}: imports ${pkg} but ${w.name}'s package.json does not list it`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
