#!/usr/bin/env node
/**
 * Pack Check Script (pact-protocol)
 * Runs pnpm pack on @pact/passport and @pact/verifier.
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync, unlinkSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const packages = [
  { name: "@pact/passport", path: join(repoRoot, "packages", "passport") },
  { name: "@pact/verifier", path: join(repoRoot, "packages", "verifier") },
];

console.log("=== Pack Check ===\n");
let allPassed = true;

for (const pkg of packages) {
  console.log(`Checking ${pkg.name}...`);
  try {
    console.log(`  Building ${pkg.name}...`);
    execSync("pnpm build", { cwd: pkg.path, stdio: "inherit" });

    console.log(`  Packing ${pkg.name}...`);
    execSync("pnpm pack", { cwd: pkg.path, stdio: "inherit" });

    for (const file of readdirSync(pkg.path)) {
      if (file.endsWith(".tgz")) unlinkSync(join(pkg.path, file));
    }

    console.log(`  ✅ ${pkg.name} packed successfully`);
  } catch (e) {
    console.error(`  ❌ ${pkg.name} failed`);
    console.error(e?.message || e);
    allPassed = false;
  }
  console.log();
}

process.exit(allPassed ? 0 : 1);
