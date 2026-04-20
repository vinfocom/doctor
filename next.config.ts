import type { NextConfig } from "next";

const cloudPePublicBaseUrl = process.env.CLOUDPE_PUBLIC_BASE_URL;
const cloudPeEndpoint = process.env.CLOUDPE_ENDPOINT;
const remoteImageUrls = [cloudPePublicBaseUrl, cloudPeEndpoint].filter(Boolean);

const remotePatterns = remoteImageUrls.flatMap((value) => {
  try {
    const parsed = new URL(String(value));
    return [
      {
        protocol: parsed.protocol.replace(":", "") as "http" | "https",
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: `${parsed.pathname.replace(/\/$/, "")}/**`,
      },
    ];
  } catch {
    return [];
  }
});

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  reactCompiler: true,
  images: {
    remotePatterns,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" },
        ]
      }
    ]
  }
};

export default nextConfig;
