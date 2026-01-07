import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/server.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  tsconfig: "tsconfig.build.json",
  banner: {
    js: "#!/usr/bin/env node\n",
  },
});
