import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built as a container for Cloud Run (PRD §14.1).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
