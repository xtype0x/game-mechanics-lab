import { configDefaults, defineConfig } from "vitest/config";

// Agent worktrees under .claude/ hold full repo copies; never collect their tests.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
