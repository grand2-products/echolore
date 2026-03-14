import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      AUTH_SECRET: "test-secret-for-vitest",
    },
  },
});
