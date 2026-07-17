import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_PUBLIC_DEMO_MODE === "true"
    ? {
        output: "export",
        ...(process.env.NEXT_PUBLIC_BASE_PATH ? { basePath: process.env.NEXT_PUBLIC_BASE_PATH } : {}),
      }
    : process.env.NEXT_OUTPUT_STANDALONE === "true"
      ? { output: "standalone" }
      : {}),
  ...(process.env.NEXT_PUBLIC_DEMO_MODE !== "true"
    ? { serverExternalPackages: ["better-sqlite3"] }
    : {}),
  images: {
    unoptimized: true
  }
};

export default nextConfig;
