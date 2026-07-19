import type { NextConfig } from "next";

const nextConfig: NextConfig = {
<<<<<<< Updated upstream
  experimental: {
    serverActions: {
      // Tender-booklet PDF uploads: client caps files at 8MB → base64 ≈ 10.7MB.
      bodySizeLimit: "12mb",
    },
  },
=======
  // Minimal self-contained build (.next/standalone) — required to keep the
  // Docker image small and to run it with `node server.js` instead of `next start`.
  output: "standalone",
>>>>>>> Stashed changes
};

export default nextConfig;
