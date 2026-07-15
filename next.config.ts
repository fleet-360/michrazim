import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Tender-booklet PDF uploads: client caps files at 8MB → base64 ≈ 10.7MB.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
