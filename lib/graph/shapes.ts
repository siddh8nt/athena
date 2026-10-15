// SVG paths for node shapes, centred on 0,0: the Taste Galaxy's and the Brand Graph's (PRD §13.11, §13.12). Shape
// carries the type, never colour alone (§13.4). Pure, client-safe.

export type ShapeName = "circle" | "triangle" | "square" | "diamond" | "hexagon" | "rect" | "star" | "pentagon" | "pill";

const poly = (n: number, r: number, start: number) =>
  Array.from({ length: n }, (_, k) => {
    const a = start + (k * 2 * Math.PI) / n;
    return `${k ? "L" : "M"}${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  }).join("") + "Z";

export function shapePath(s: ShapeName, r: number): string {
  switch (s) {
    case "circle":
      return `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
    case "triangle":
      return poly(3, r * 1.3, -Math.PI / 2);
    case "diamond":
      return poly(4, r * 1.3, 0);
    case "square":
      return poly(4, r * 1.2, Math.PI / 4);
    case "hexagon":
      return poly(6, r * 1.1, 0);
    case "pentagon":
      return poly(5, r * 1.15, -Math.PI / 2);
    case "star":
      return Array.from({ length: 10 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.55 : r * 1.3;
        return `${k ? "L" : "M"}${(rr * Math.cos(a)).toFixed(2)} ${(rr * Math.sin(a)).toFixed(2)}`;
      }).join("") + "Z";
    case "pill":
      return `M${-r * 0.6} ${-r * 0.7}h${r * 1.2}a${r * 0.7} ${r * 0.7} 0 0 1 0 ${r * 1.4}h${-r * 1.2}a${r * 0.7} ${r * 0.7} 0 0 1 0 ${-r * 1.4}Z`;
    default:
      return `M${-r * 1.15} ${-r * 0.75}h${r * 2.3}v${r * 1.5}h${-r * 2.3}Z`;
  }
}
