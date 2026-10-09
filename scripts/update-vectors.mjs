// Regenerates packages/core/vectors/*.json. Review the git diff before committing:
// any change means core results changed for downstream ports.
import { spawnSync } from "node:child_process";

const res = spawnSync("npx", ["vitest", "run", "packages/core/test/vectors.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, UPDATE_VECTORS: "1" },
});
process.exit(res.status ?? 1);
