import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/dist/**", "**/node_modules/**", "**/.next/**"],
    env: {
      AUTH_SECRET: "test-secret-for-vitest",
    },
  },
});
