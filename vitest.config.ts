import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      // Browser-SDK glue (Firebase init, AI Logic model construction, the browser deps). Not unit-testable without the SDK's
      // browser runtime; it is exercised end to end by e2e/live-flow.spec.ts and scripts/e2e-nano.mjs against the real services.
      exclude: ["src/lib/firebase.ts", "src/lib/check/browserDeps.ts", "src/lib/ai/models.ts", "src/lib/ai/deviceModel.ts", "src/lib/ai/prompts.ts"],
      reporter: ["text-summary", "lcov"],
      // A floor, not a target: set just under what the suite measures so a drop fails CI.
      thresholds: { statements: 80, lines: 82, functions: 80, branches: 70 },
    },
  },
});
