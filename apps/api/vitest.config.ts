import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["dist/**", "node_modules/**"],
    env: {
      AUTH_SECRET: "test-secret-for-vitest",
    },
  },
});
