import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
    const apiUrl = process.env.ECHOLORE_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL;
    const livekitUrl =
      process.env.ECHOLORE_PUBLIC_LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const extraConnectSrc = [
      apiUrl,
      livekitUrl,
      // Allow ws:// WebSocket connections to the API server (derived from http:// URL)
      apiUrl?.replace(/^http:/, "ws:"),
      apiUrl?.replace(/^https:/, "wss:"),
    ]
      .filter(Boolean)
      .join(" ");

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
