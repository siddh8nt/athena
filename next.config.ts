import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built as a container for Cloud Run (PRD §14.1).
  output: "standalone",
  poweredByHeader: false,
  // The free test server (scripts/dev-free.mjs) builds into its own folder, so it can run beside `pnpm dev`.
  distDir: process.env.ATHENA_DIST_DIR || ".next",
};

export default nextConfig;
