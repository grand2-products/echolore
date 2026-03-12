import type { NextConfig } from "next";

const resolveAuthGatewayUrl = () => {
  if (process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL) {
    return process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL;
  }

  if (process.env.OAUTH_PROXY_PORT) {
    return `http://localhost:${process.env.OAUTH_PROXY_PORT}`;
  }

  return undefined;
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
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
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_AUTH_GATEWAY_URL: resolveAuthGatewayUrl(),
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
  },
};

export default nextConfig;
