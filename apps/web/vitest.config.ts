import fs from "node:fs";
import path from "node:path";

import { defineConfig, type Plugin } from "vitest/config";

/** Load .yaml files as raw strings, matching the Next.js webpack raw-loader config. */
function yamlRawPlugin(): Plugin {
  return {
    name: "yaml-raw",
    transform(_code, id) {
      if (id.endsWith(".yaml") || id.endsWith(".yml")) {
        const raw = fs.readFileSync(id, "utf-8");
        return { code: `export default ${JSON.stringify(raw)};`, map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [yamlRawPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@contracts": path.resolve(__dirname, "../../packages/shared/src/contracts"),
    },
  },
  test: {
    environment: "node",
  },
});
