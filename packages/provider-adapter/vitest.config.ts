import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@pact/sdk": resolve(__dirname, "../sdk/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".git"],
    // prevents weird worker fetch behavior in some setups
    pool: "threads",
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});


