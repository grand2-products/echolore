import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/** Collect all non-internal IPv4 addresses so LAN clients can use HMR. */
function getLocalIPs(): string[] {
  const ips: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: getLocalIPs(),
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
      "*.yaml": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    // Avoid Windows standalone trace-copy churn for route groups during local builds.
    if (process.platform === "win32") {
      config.snapshot = {
        ...(config.snapshot ?? {}),
        managedPaths: [],
      };
    }

    // Load .yaml and .md files as raw strings
    config.module.rules.push({
      test: /\.yaml$/,
      type: "asset/source",
    });
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  // NOTE: Content-Security-Policy is intentionally NOT set here. `headers()` is
  // evaluated at build time, which froze `connect-src` to whatever
  // ECHOLORE_PUBLIC_API_URL was present during `next build` (e.g. a stray dev
  // apps/web/.env.local pinned it to :17721, blocking dogfood's API on :17821).
  // CSP is now generated per-request in `middleware.ts` from the request Host,
  // so a single pre-built image works against any host/port (runtime-env pattern).
};

export default nextConfig;
