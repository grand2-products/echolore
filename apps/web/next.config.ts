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
  async headers() {
    const apiUrl = process.env.ECHOLORE_PUBLIC_API_URL;
    const livekitUrl = process.env.ECHOLORE_PUBLIC_LIVEKIT_URL;
    // Build CSP connect-src entries for configured URLs and their LAN-IP equivalents
    const lanUrls = (url: string | undefined) => {
      if (!url) return [];
      const entries = [url, url.replace(/^http:/, "ws:"), url.replace(/^https:/, "wss:")];
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          for (const ip of getLocalIPs()) {
            const lanUrl = new URL(url);
            lanUrl.hostname = ip;
            entries.push(lanUrl.toString().replace(/\/$/, ""));
            entries.push(
              lanUrl
                .toString()
                .replace(/\/$/, "")
                .replace(/^http:/, "ws:")
            );
          }
        }
      } catch {}
      return entries;
    };
    const extraConnectSrc = [...lanUrls(apiUrl), ...lanUrls(livekitUrl)].filter(Boolean).join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              `connect-src 'self' blob: wss: https:${extraConnectSrc ? ` ${extraConnectSrc}` : ""}`,
              "media-src 'self' blob:",
              "frame-src 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
