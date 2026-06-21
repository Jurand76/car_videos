import type { NextConfig } from "next";

const gatewayUrl = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/video", destination: `${gatewayUrl}/video` },
      { source: "/video/:path*", destination: `${gatewayUrl}/video/:path*` },
      { source: "/api/health", destination: `${gatewayUrl}/api/health` },
      { source: "/api/me", destination: `${gatewayUrl}/api/me` },
      { source: "/api/logout", destination: `${gatewayUrl}/api/logout` },
      { source: "/api/project", destination: `${gatewayUrl}/api/project` },
      { source: "/api/assets", destination: `${gatewayUrl}/api/assets` },
      { source: "/api/audio", destination: `${gatewayUrl}/api/audio` },
      { source: "/api/upload/:path*", destination: `${gatewayUrl}/api/upload/:path*` },
      { source: "/api/analyze-audio", destination: `${gatewayUrl}/api/analyze-audio` },
      { source: "/api/generate-descriptions", destination: `${gatewayUrl}/api/generate-descriptions` },
      { source: "/api/generate", destination: `${gatewayUrl}/api/generate` },
      { source: "/api/video-projects", destination: `${gatewayUrl}/api/video-projects` },
      { source: "/api/video-projects/:path*", destination: `${gatewayUrl}/api/video-projects/:path*` },
      { source: "/public/:path*", destination: `${gatewayUrl}/public/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
