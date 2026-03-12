import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
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
