// packages/sdk/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".git", ".turbo", "**/fixtures/**"],
    environment: "node",
    testTimeout: 10000, // 10 seconds (default is 5s)
    hookTimeout: 10000, // For setup/teardown hooks
  },
});