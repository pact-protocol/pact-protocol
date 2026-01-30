"use strict";

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "ignoreRestSiblings": true }],
    "@typescript-eslint/no-explicit-any": "warn",
    "no-useless-escape": "warn",
  },
  overrides: [
    {
      files: ["packages/sdk/**/*.ts"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-var-requires": "off",
        "prefer-const": "off",
        "no-empty": "off",
        "no-inner-declarations": "off",
      },
    },
    {
      files: ["apps/evidence-viewer/**/*.{ts,tsx}"],
      env: { browser: true },
      plugins: ["react-hooks", "react-refresh"],
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      },
    },
  ],
  ignorePatterns: ["dist", "node_modules", "*.cjs", "*.mjs", "coverage", ".next"],
};
