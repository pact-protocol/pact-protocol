import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/__tests__/*.test.ts"],
    exclude: [
      "src/__tests__/labeler.test.ts",
      "src/__tests__/normalize.test.ts",
      "src/__tests__/scoring.test.ts",
    ],
  },
});
