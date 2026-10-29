import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Built as a container for Cloud Run (PRD §14.1).
  output: "standalone",
  poweredByHeader: false,
  // The free test server (scripts/dev-free.mjs) builds into its own folder, so it can run beside `pnpm dev`.
  distDir: process.env.ATHENA_DIST_DIR || ".next",
  // The old demo brand pages are gone; an old link lands on the landing page instead of a 404.
  async redirects() {
    return ["brightland", "timeleft", "master-dynamic"].map((slug) => ({ source: `/${slug}`, destination: "/", permanent: false }));
  },
};

export default nextConfig;
