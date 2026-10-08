import { defineConfig } from "vitest/config";
import path from "node:path";

// Live runs against the real Qloo API (needs QLOO_API_KEY in .env). Not part of `pnpm test`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: { include: ["tests/live/**/*.live.ts"], environment: "node", testTimeout: 900_000 },
});
