import { execSync } from "node:child_process";

const files = [
  "packages/sdk/src/policy/index.ts",
  "packages/sdk/src/engine/session.ts",
  "packages/sdk/src/exchange/streaming.ts",
  "packages/sdk/src/exchange/receipt.ts",
];

for (const f of files) {
  try {
    execSync(`node --check ${f}`, { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

console.log("✅ syntax-check passed");
