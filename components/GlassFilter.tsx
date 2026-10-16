// The lens behind the glass chat sheet. Near the sheet's rim the backdrop is bent inward, the way light bends at the edge
// of real glass, and the red, green and blue channels bend by slightly different amounts, so the code pattern picks up a
// faint rainbow fringe there. Browsers that can't run an SVG filter as a backdrop keep the plain frosted glass.

// Displacement maps stretched over the sheet. 50% grey means "don't move"; brighter or darker pushes the sample one way
// or the other. Only a thin band at each edge moves, so the middle of the sheet reads straight.
const ramp = (dir: "x" | "y", ch: "r" | "g") => {
  const [x2, y2] = dir === "x" ? ["1", "0"] : ["0", "1"];
  const c = (v: number) => (ch === "r" ? `rgb(${v},128,128)` : `rgb(128,${v},128)`);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='${x2}' y2='${y2}'><stop offset='0' stop-color='${c(255)}'/><stop offset='0.07' stop-color='${c(128)}'/><stop offset='0.93' stop-color='${c(128)}'/><stop offset='1' stop-color='${c(0)}'/></linearGradient></defs><rect width='100' height='100' fill='url(%23g)'/></svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/#/g, "%23").replace(/"/g, "'")}`;
};

function Bend({ scale, out }: { scale: number; out: string }) {
  return (
    <>
      <feDisplacementMap in="SourceGraphic" in2="mapX" scale={scale} xChannelSelector="R" yChannelSelector="B" result={`${out}x`} />
      <feDisplacementMap in={`${out}x`} in2="mapY" scale={scale} xChannelSelector="B" yChannelSelector="G" result={out} />
    </>
  );
}

export function GlassFilter() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
      <filter id="athena-glass" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
        <feImage href={ramp("x", "r")} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="mapX" />
        <feImage href={ramp("y", "g")} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="mapY" />
        {/* Three bends, one per colour, slightly apart: the dispersion. */}
        <Bend scale={0.045} out="bR" />
        <Bend scale={0.04} out="bG" />
        <Bend scale={0.035} out="bB" />
        <feColorMatrix in="bR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
        <feColorMatrix in="bG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
        <feColorMatrix in="bB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
        <feBlend in="r" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b" mode="screen" />
      </filter>
    </svg>
  );
}
