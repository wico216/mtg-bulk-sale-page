import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
      "scripts/**/__tests__/**/*.test.ts",
    ],
    // Default env = node (fast). The Phase 19 component / store / orchestrator
    // tests opt into a DOM env via `// @vitest-environment happy-dom` at the
    // top of each .test.tsx (or .test.ts that touches localStorage), which
    // overrides this default per-file. See:
    // https://vitest.dev/config/#environmentmatchglobs (deprecated but the
    // per-file directive remains the supported escape hatch).
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
