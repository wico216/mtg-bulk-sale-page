import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
