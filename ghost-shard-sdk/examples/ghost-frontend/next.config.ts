import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  turbopack: {
    resolveAlias: {
      encoding: {},
      "pino-pretty": {},
      lokijs: {},
    },
  },
};

export default nextConfig;
