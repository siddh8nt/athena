// MapLibre 6 ships as ES modules whose worker is found next to the main file (import.meta.url).
// Bundling breaks that, so MapView loads the untouched files from /public/maplibre at runtime.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.css"));
const out = path.join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs", "maplibre-gl.css"]) copyFileSync(path.join(dist, f), path.join(out, f));
console.log("maplibre copied to public/maplibre");
