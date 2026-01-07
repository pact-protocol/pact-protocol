import { defineConfig } from "vitest/config";

export default defineConfig({
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


