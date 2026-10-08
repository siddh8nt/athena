import { meters } from "./names";

// Field-day route (§9.12): nearest neighbour from the start, improved with 2-opt, up to 8 stops.
// Outputs a Google Maps directions link and an .ics file with 30-minute visits plus travel time.

export type Stop = { id: string; name: string; address?: string; lat: number; lon: number };

const dist = (a: Stop, b: Stop) => meters([a.lat, a.lon], [b.lat, b.lon]);

function length(order: Stop[]): number {
  let d = 0;
  for (let i = 1; i < order.length; i++) d += dist(order[i - 1], order[i]);
  return d;
}

export function planRoute(stops: Stop[], max = 8): Stop[] {
  const pool = stops.slice(0, max);
  if (pool.length <= 2) return pool;
  // Nearest neighbour from the first stop (the top-ranked pick).
  const order = [pool[0]];
  const left = pool.slice(1);
  while (left.length) {
    const last = order[order.length - 1];
    let best = 0;
    for (let i = 1; i < left.length; i++) if (dist(last, left[i]) < dist(last, left[best])) best = i;
    order.push(left.splice(best, 1)[0]);
  }
  // 2-opt, keeping the start fixed.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++)
      for (let k = i + 1; k < order.length; k++) {
        const next = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        if (length(next) + 1 < length(order)) {
          order.splice(0, order.length, ...next);
          improved = true;
        }
      }
  }
  return order;
}

export function routeMeters(order: Stop[]): number {
  return length(order);
}

const place = (s: Stop) => encodeURIComponent(s.address ? `${s.name}, ${s.address}` : `${s.lat},${s.lon}`);

/** Google Maps directions URL with waypoints (origin, up to 6 waypoints, destination). */
export function mapsUrl(order: Stop[], mode: "walking" | "transit" | "driving" = "driving"): string {
  if (!order.length) return "https://www.google.com/maps";
  const [origin, ...rest] = order;
  const destination = rest.pop() ?? origin;
  const waypoints = rest.map(place).join("%7C");
  return `https://www.google.com/maps/dir/?api=1&origin=${place(origin)}&destination=${place(destination)}${waypoints ? `&waypoints=${waypoints}` : ""}&travelmode=${mode}`;
}

/** An .ics calendar with a 30-minute visit per stop, plus travel time at ~25 km/h between stops. */
export function routeIcs(order: Stop[], day: Date, brand: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  let t = new Date(day);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Athena//Field day//EN"];
  order.forEach((s, i) => {
    if (i > 0) t = new Date(t.getTime() + Math.round((dist(order[i - 1], s) / 25_000) * 60) * 60_000);
    const end = new Date(t.getTime() + 30 * 60_000);
    lines.push("BEGIN:VEVENT", `UID:${s.id}-${t.getTime()}@athena`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(t)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(`${brand} visit: ${s.name}`)}`, ...(s.address ? [`LOCATION:${esc(s.address)}`] : []), "END:VEVENT");
    t = end;
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
