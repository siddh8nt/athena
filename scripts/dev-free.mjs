// The free test server: the whole journey on port 3001 with no paid call. Qloo serves fixtures, so the team runs
// without Gemini (app/api/team/route.ts); no Google project, so no other Gemini call and no Firestore; Ticketmaster,
// Census and mail are off. It builds into .next-free and keeps its store in .cache/store-free, so it runs beside
// `pnpm dev` and its made-up results never reach the live store. The data is fabricated and the wording canned.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = {
  ...process.env,
  ATHENA_FIXTURES: "1",
  GOOGLE_CLOUD_PROJECT: "",
  TICKETMASTER_API_KEY: "",
  CENSUS_API_KEY: "",
  SMTP_HOST: "",
  ATHENA_DIST_DIR: ".next-free",
  ATHENA_STORE_DIR: ".cache/store-free",
};
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "-p", "3001"], { env, stdio: "inherit" });
next.on("exit", (code) => process.exit(code ?? 0));
