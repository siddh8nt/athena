// Geohash helpers shared by the server (crowd geography, §9.26) and the map. Pure, no imports.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Geohash → [minLon, minLat, maxLon, maxLat]. */
export function geohashBounds(hash: string): [number, number, number, number] | undefined {
  let even = true;
  const lat = [-90, 90];
  const lon = [-180, 180];
  for (const ch of hash.toLowerCase()) {
    const v = BASE32.indexOf(ch);
    if (v < 0) return undefined;
    for (let bit = 4; bit >= 0; bit--) {
      const b = (v >> bit) & 1;
      const r = even ? lon : lat;
      const mid = (r[0] + r[1]) / 2;
      if (b) r[0] = mid;
      else r[1] = mid;
      even = !even;
    }
  }
  return [lon[0], lat[0], lon[1], lat[1]];
}

export function geohashEncode(lat: number, lon: number, precision: number): string {
  let even = true;
  let bit = 0;
  let ch = 0;
  let out = "";
  const la = [-90, 90];
  const lo = [-180, 180];
  while (out.length < precision) {
    const r = even ? lo : la;
    const v = even ? lon : lat;
    const mid = (r[0] + r[1]) / 2;
    if (v >= mid) {
      ch = (ch << 1) | 1;
      r[0] = mid;
    } else {
      ch <<= 1;
      r[1] = mid;
    }
    even = !even;
    if (++bit === 5) {
      out += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return out;
}

/** The 8 cells around a geohash, at the same precision (fewer at the poles; longitude wraps). */
export function geohashNeighbours(hash: string): string[] {
  const b = geohashBounds(hash);
  if (!b) return [];
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  const lat = (b[1] + b[3]) / 2;
  const lon = (b[0] + b[2]) / 2;
  const out: string[] = [];
  for (const dy of [-1, 0, 1])
    for (const dx of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const y = lat + dy * h;
      if (y <= -90 || y >= 90) continue;
      const x = ((lon + dx * w + 540) % 360) - 180;
      out.push(geohashEncode(y, x, hash.length));
    }
  return out;
}
