// MAI·Image Studio — procedural canvas generators.
//
// Compositions are built progressively:  STYLE (the overall aesthetic)
// → GEOMETRY (a base shape/pattern) → EFFECT (a loose treatment applied on
// top) → COLOR.  These run client-side only (they need a real <canvas>) and
// drive the thumbnails, the live base preview, and the procedural fallback.
// The real output comes from MAI-Image-2.5 (app/api/generate/route.ts), which
// is prompted in the same style → geometry → effect → color order.
//
// Two named styles set the whole look:
//   • atmospheric — "Atmospheric Minimalism": soft diffusion, airbrushed glow,
//     large negative space, film grain. Behaviour as meaning (the reference
//     image: pale warm field, vertical tonal bands, white arcs propagating).
//   • geometric — "Abstract Geometric Modernism": hard-edged geometry, grids,
//     layered transparent fields, connection lines, a strictly limited palette.

export type Style = "atmospheric" | "geometric";
export type Geometry = "radial" | "ripple" | "lines" | "string" | "wave";
export type Effect = "glow" | "ascii" | "dataviz" | "repeat" | "minimal";

export const STYLES: { key: Style; label: string }[] = [
  { key: "atmospheric", label: "Atmospheric" },
  { key: "geometric", label: "Geometric" },
];

export const STYLE_LABELS: Record<Style, string> = {
  atmospheric: "Atmospheric",
  geometric: "Geometric",
};

// Full names — used in captions / history labels.
export const STYLE_FULL: Record<Style, string> = {
  atmospheric: "Atmospheric Minimalism",
  geometric: "Abstract Geometric Modernism",
};

// How strongly the foreground saturates the background across the field
// gradient (atmospheric) / transparency fields (geometric). 0 = pale, mostly
// ground; 1 = bold, foreground-dominant. Static thumbnails use this default.
export const DEFAULT_INTENSITY = 0.8;

export const GEOMETRIES: { key: Geometry; label: string }[] = [
  { key: "radial", label: "Radial" },
  { key: "ripple", label: "Ripple" },
  { key: "lines", label: "Lines" },
  { key: "string", label: "String" },
  { key: "wave", label: "Wave" },
];

export const EFFECTS: { key: Effect; label: string }[] = [
  { key: "glow", label: "Glow" },
  { key: "ascii", label: "ASCII" },
  { key: "dataviz", label: "Data" },
  { key: "repeat", label: "Repeat" },
  { key: "minimal", label: "Minimal" },
];

export const GEOMETRY_LABELS: Record<Geometry, string> = {
  radial: "Radial",
  ripple: "Ripple",
  lines: "Lines",
  string: "String",
  wave: "Wave",
};

export const EFFECT_LABELS: Record<Effect, string> = {
  glow: "Glow",
  ascii: "ASCII",
  dataviz: "Data",
  repeat: "Repeat",
  minimal: "Minimal",
};

// Sample geometry used to render the EFFECT thumbnails (shows the treatment).
const EFFECT_SAMPLE_GEOM: Geometry = "ripple";

export const FG_SWATCHES = [
  { name: "Crimson", color: "#d23b34" },
  { name: "Ember", color: "#e0792a" },
  { name: "Gold", color: "#e7b22d" },
  { name: "Forest", color: "#3f7d68" },
  { name: "Cobalt", color: "#3a57c4" },
  { name: "Violet", color: "#7b54c6" },
  { name: "Magenta", color: "#c43a86" },
  { name: "Lilac", color: "#cc9ff9" },
  { name: "Sky", color: "#7ee3fc" },
  { name: "Aqua", color: "#70e1d0" },
  { name: "Lime", color: "#aeed4c" },
  { name: "Lemon", color: "#fdf150" },
  { name: "Apricot", color: "#f19859" },
  { name: "Ink", color: "#1a1a1a" },
];

export const BG_SWATCHES = [
  { name: "Paper", color: "#f4f1ea" },
  { name: "Cream", color: "#f7ecd6" },
  { name: "Marigold", color: "#f1b24a" },
  { name: "Mist", color: "#e9efe9" },
  { name: "Periwinkle", color: "#eceefb" },
  { name: "Blush", color: "#f7e7e4" },
  { name: "Lilac", color: "#cc9ff9" },
  { name: "Sky", color: "#7ee3fc" },
  { name: "Aqua", color: "#70e1d0" },
  { name: "Lime", color: "#aeed4c" },
  { name: "Lemon", color: "#fdf150" },
  { name: "Apricot", color: "#f19859" },
  { name: "Slate", color: "#23252b" },
  { name: "Black", color: "#141414" },
];

/* ---------- utils ---------- */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Push a colour toward white by `amt` (0 = unchanged, 1 = white). Used to
// derive the warm near-white glow of the Atmospheric arcs from the palette.
function lighten(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const L = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${L(r)},${L(g)},${L(b)})`;
}

// Linear interpolation between two colours (t = 0 → a, t = 1 → b).
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(A.r, B.r)},${m(A.g, B.g)},${m(A.b, B.b)})`;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a hash → deterministic seed per input.
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- geometry (base structure) ---------- */

// Concentric radial contour lines — topographic / radar-like rings.
function drawRadial(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  const cx = W * (0.4 + rand() * 0.2);
  const cy = H * (0.4 + rand() * 0.2);
  const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const rings = 18 + Math.floor(rand() * 16);
  ctx.lineWidth = Math.max(0.8, W * 0.0013);
  const wobScale = 0.008 + rand() * 0.02;
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const rad = t * maxR;
    const k = 2 + (i % 4);
    const ph = i * 1.3;
    ctx.beginPath();
    const seg = 160;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const wob = 1 + Math.sin(a * k + ph) * wobScale * (1 - t * 0.6);
      const x = cx + Math.cos(a) * rad * wob;
      const y = cy + Math.sin(a) * rad * wob;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(fg, 0.22 + 0.5 * (1 - t));
    ctx.stroke();
  }
}

// Concentric right-facing arcs rippling from an off-center point.
function drawRipple(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  const cx = W * (0.12 + rand() * 0.16);
  const cy = H * (0.4 + rand() * 0.2);
  const rings = 7 + Math.floor(rand() * 6);
  for (let i = 1; i <= rings; i++) {
    const rad = (i / rings) * W * 0.95;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, Math.PI / 2);
    ctx.lineWidth = Math.max(2, W * 0.006);
    ctx.strokeStyle = rgba(fg, 0.7);
    ctx.stroke();
  }
}

// Vertical lines of varying weight — thick and thin, rhythmically spaced.
function drawLines(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  const baseUnit = W / (30 + Math.floor(rand() * 16));
  let x = rand() * baseUnit;
  while (x < W) {
    const thick = rand() > 0.6;
    const w = Math.max(
      0.75,
      thick ? baseUnit * (0.45 + rand() * 1.0) : baseUnit * (0.05 + rand() * 0.18),
    );
    const alpha = thick ? 0.5 + rand() * 0.4 : 0.18 + rand() * 0.3;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, rgba(fg, alpha));
    grd.addColorStop(1, rgba(fg, alpha * 0.55));
    ctx.fillStyle = grd;
    ctx.fillRect(x, 0, w, H);
    x += w + baseUnit * (0.25 + rand() * 0.9);
  }
}

// String-art geometry — straight lines spanning point sets to form envelopes.
function drawString(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  ctx.lineWidth = Math.max(0.5, W * 0.0006);
  ctx.strokeStyle = rgba(fg, 0.5);
  const sets = 2 + Math.floor(rand() * 3);
  for (let s = 0; s < sets; s++) {
    const n = 22 + Math.floor(rand() * 20);
    const ax0 = rand() * W,
      ay0 = rand() * H,
      ax1 = rand() * W,
      ay1 = rand() * H;
    const bx0 = rand() * W,
      by0 = rand() * H,
      bx1 = rand() * W,
      by1 = rand() * H;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const pax = ax0 + (ax1 - ax0) * t;
      const pay = ay0 + (ay1 - ay0) * t;
      const pbx = bx0 + (bx1 - bx0) * (1 - t);
      const pby = by0 + (by1 - by0) * (1 - t);
      ctx.moveTo(pax, pay);
      ctx.lineTo(pbx, pby);
    }
    ctx.stroke();
  }
}

// Layered signal waves / sine curves — oscilloscope-like.
function drawWave(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  const lines = 14 + Math.floor(rand() * 16);
  ctx.lineWidth = Math.max(0.8, W * 0.0012);
  for (let i = 0; i < lines; i++) {
    const baseY = ((i + 0.5) / lines) * H;
    const amp = (H / lines) * (0.6 + rand() * 1.7);
    const freq = ((1 + rand() * 4) * Math.PI * 2) / W;
    const phase = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const env = 0.5 + 0.5 * Math.sin((x / W) * Math.PI);
      const y = baseY + Math.sin(x * freq + phase) * amp * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(fg, 0.3 + 0.4 * rand());
    ctx.stroke();
  }
}

/* ---------- effects (loose treatments) ---------- */

// Soft luminous gradient glow, additively blended.
function effectGlow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const cx = W * (0.2 + rand() * 0.6);
    const cy = H * (0.2 + rand() * 0.6);
    const rad = W * (0.25 + rand() * 0.35);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, rgba(fg, 0.5));
    gr.addColorStop(1, rgba(fg, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ASCII / dot-matrix character field overlaid on the geometry.
function effectAscii(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  const ramp = " .:-=+*#%@";
  const cols = 54;
  const cell = W / cols;
  const rows = Math.ceil(H / cell);
  ctx.textBaseline = "top";
  ctx.font = Math.round(cell * 1.05) + 'px ui-monospace, "SF Mono", Menlo, monospace';
  const blobs: { x: number; y: number; r: number }[] = [];
  const nb = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < nb; i++)
    blobs.push({ x: rand() * W, y: rand() * H, r: (0.15 + rand() * 0.3) * W });
  const gx = rand(),
    gy = rand();
  for (let jy = 0; jy < rows; jy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = ix * cell,
        y = jy * cell;
      let v = 0;
      for (const bl of blobs) {
        const d = Math.hypot(x - bl.x, y - bl.y);
        v += Math.max(0, 1 - d / bl.r);
      }
      v = Math.min(1, v + (x / W) * gx * 0.4 + (1 - y / H) * gy * 0.4);
      const ch = ramp[Math.floor(v * (ramp.length - 1))];
      if (ch === " ") continue;
      ctx.fillStyle = rgba(fg, 0.25 + 0.45 * v);
      ctx.fillText(ch, x, y);
    }
  }
}

// Abstract data-visualization marks — gridlines, a plotted line, points.
function effectDataviz(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  ctx.save();
  ctx.strokeStyle = rgba(fg, 0.18);
  ctx.lineWidth = Math.max(0.5, W * 0.0006);
  const gl = 6 + Math.floor(rand() * 5);
  for (let i = 1; i < gl; i++) {
    const y = (i / gl) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const pts = 10 + Math.floor(rand() * 10);
  const coords: [number, number][] = [];
  ctx.strokeStyle = rgba(fg, 0.6);
  ctx.lineWidth = Math.max(1, W * 0.0018);
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const x = (i / pts) * W;
    const y = H * (0.18 + rand() * 0.64);
    coords.push([x, y]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = rgba(fg, 0.8);
  const dot = Math.max(2, W * 0.004);
  for (const [x, y] of coords) {
    ctx.beginPath();
    ctx.arc(x, y, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Tile the composition into a repeating modular grid.
function effectRepeat(ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const tiles = 2 + Math.floor(rand() * 2);
  const src = document.createElement("canvas");
  src.width = W;
  src.height = H;
  src.getContext("2d")!.drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const tw = W / tiles,
    th = H / tiles;
  for (let y = 0; y < tiles; y++)
    for (let x = 0; x < tiles; x++) ctx.drawImage(src, x * tw, y * th, tw, th);
}

// Minimalism — mute most of the composition into negative space.
function effectMinimal(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string) {
  ctx.save();
  ctx.fillStyle = rgba(bg, 0.62);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function applyEffect(
  ctx: CanvasRenderingContext2D,
  effect: Effect | "none",
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  if (effect === "glow") effectGlow(ctx, W, H, fg, rand);
  else if (effect === "ascii") effectAscii(ctx, W, H, fg, rand);
  else if (effect === "dataviz") effectDataviz(ctx, W, H, fg, rand);
  else if (effect === "repeat") effectRepeat(ctx, W, H, rand);
  else if (effect === "minimal") effectMinimal(ctx, W, H, bg);
  // "none": leave the geometry untouched (used for geometry thumbnails)
}

/* ---------- style: shared treatments ---------- */

// Film grain. Builds a one-off noise tile and composites it in "overlay" so it
// lifts highlights and deepens shadows like real photographic grain. Seeded via
// `rand`, so a given composition always grains identically.
function addGrain(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  rand: () => number,
  alpha: number,
) {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rand() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

/* ---------- style: atmospheric minimalism ---------- */

// A warm field that fades from the pale ground (left) to the saturated
// foreground (right), exactly like the reference image.
function atmosphericField(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  bg: string,
  intensity: number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // `intensity` scales how far the field pushes from ground toward foreground:
  // 0 → flat ground, 1 → the right edge reaches full foreground.
  const t = clamp01(intensity);
  const grd = ctx.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, bg);
  grd.addColorStop(0.4, mix(bg, fg, 0.55 * t));
  grd.addColorStop(1, mix(bg, fg, t));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
}

// Soft vertical tonal bands — translucent slabs of the saturated colour that
// give the field its subtle column structure.
function atmosphericBands(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  intensity: number,
  rand: () => number,
) {
  const t = clamp01(intensity);
  const n = 4 + ((rand() * 3) | 0);
  let x = W * (0.12 + rand() * 0.1);
  for (let i = 0; i < n; i++) {
    const w = W * (0.06 + rand() * 0.14);
    ctx.fillStyle = rgba(fg, (0.05 + rand() * 0.1) * (0.35 + 0.95 * t));
    ctx.fillRect(x, 0, w, H);
    x += w + W * (0.03 + rand() * 0.07);
    if (x > W) break;
  }
}

// The luminous forms themselves, drawn bright on an offscreen layer then
// composited twice through a blur: a wide bloom plus a tighter core. Screen
// blending turns the warm glow colour to near-white over the orange field.
function atmosphericForms(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  W: number,
  H: number,
  glow: string,
  rand: () => number,
) {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const o = off.getContext("2d")!;
  o.strokeStyle = glow;
  o.fillStyle = glow;
  o.lineCap = "round";
  o.lineJoin = "round";

  if (geometry === "ripple" || geometry === "radial") softArcs(o, W, H, rand);
  else if (geometry === "wave") softWaves(o, W, H, rand);
  else if (geometry === "lines") softColumns(o, W, H, rand);
  else softEnvelope(o, W, H, rand);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${Math.max(2, W * 0.014)}px)`;
  ctx.drawImage(off, 0, 0);
  ctx.filter = `blur(${Math.max(1, W * 0.004)}px)`;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

// Concentric arcs of increasing radius propagating from a centre-left point,
// with a small spiral curl at the origin — the signature reference motif.
function softArcs(ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const cx = W * (0.15 + rand() * 0.08);
  const cy = H * (0.46 + rand() * 0.08);
  const rings = 4 + ((rand() * 2) | 0);
  const lw = W * 0.02;
  const spread = Math.PI * (0.55 + rand() * 0.12);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const rad = t * W * 0.82;
    ctx.lineWidth = lw * (0.65 + 0.55 * t);
    ctx.globalAlpha = 0.9 - t * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -spread, spread);
    ctx.stroke();
  }
  // origin spiral
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath();
  const steps = 90;
  const turns = 1.5;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const ang = t * Math.PI * 2 * turns - Math.PI / 2;
    const r = W * 0.018 + t * W * 0.06;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (s === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Soft horizontal signal waves, low frequency, lots of air.
function softWaves(ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const lines = 3 + ((rand() * 3) | 0);
  ctx.lineWidth = W * 0.016;
  for (let i = 0; i < lines; i++) {
    const baseY = H * (0.3 + (i / lines) * 0.45);
    const amp = H * (0.04 + rand() * 0.06);
    const freq = ((1 + rand() * 1.6) * Math.PI * 2) / W;
    const phase = rand() * Math.PI * 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const env = 0.4 + 0.6 * Math.sin((x / W) * Math.PI);
      const y = baseY + Math.sin(x * freq + phase) * amp * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// A few soft glowing vertical columns.
function softColumns(ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  const n = 3 + ((rand() * 3) | 0);
  let x = W * (0.18 + rand() * 0.1);
  for (let i = 0; i < n; i++) {
    const w = W * (0.012 + rand() * 0.02);
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x, H * 0.12, w, H * 0.76);
    x += W * (0.12 + rand() * 0.12);
    if (x > W * 0.92) break;
  }
}

// A soft glowing curved envelope traced by a fan of straight chords.
function softEnvelope(ctx: CanvasRenderingContext2D, W: number, H: number, rand: () => number) {
  ctx.lineWidth = W * 0.004;
  ctx.globalAlpha = 0.7;
  const n = 26 + ((rand() * 14) | 0);
  const ax0 = W * 0.15,
    ay0 = H * 0.15,
    ax1 = W * 0.15,
    ay1 = H * 0.85;
  const bx0 = W * 0.15,
    by0 = H * 0.85,
    bx1 = W * 0.85,
    by1 = H * 0.85;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.moveTo(ax0 + (ax1 - ax0) * t, ay0 + (ay1 - ay0) * t);
    ctx.lineTo(bx0 + (bx1 - bx0) * t, by0 + (by1 - by0) * t);
  }
  ctx.stroke();
}

function renderAtmospheric(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  effect: Effect | "none",
  W: number,
  H: number,
  fg: string,
  bg: string,
  intensity: number,
  rand: () => number,
) {
  const glow = lighten(mix(bg, fg, 0.15), 0.82); // warm near-white
  atmosphericField(ctx, W, H, fg, bg, intensity);
  atmosphericBands(ctx, W, H, fg, intensity, rand);
  atmosphericForms(ctx, geometry, W, H, glow, rand);
  applyEffect(ctx, effect, W, H, fg, bg, rand);
  addGrain(ctx, W, H, rand, 0.16); // signature film grain
}

/* ---------- style: abstract geometric modernism ---------- */

// A faint coordinate grid / modular block field.
function geometricGrid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  ctx.save();
  ctx.strokeStyle = rgba(fg, 0.1);
  ctx.lineWidth = Math.max(0.5, W * 0.0008);
  const cells = 8 + ((rand() * 5) | 0);
  for (let i = 1; i < cells; i++) {
    const x = (i / cells) * W;
    const y = (i / cells) * H;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Layered transparent rectangles — the "transparency fields" of the style.
// `intensity` controls how opaque the foreground fills read over the ground.
function geometricFields(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  intensity: number,
  rand: () => number,
) {
  const t = clamp01(intensity);
  ctx.save();
  const n = 2 + ((rand() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const w = W * (0.24 + rand() * 0.4);
    const h = H * (0.24 + rand() * 0.4);
    const x = rand() * (W - w);
    const y = rand() * (H - h);
    ctx.fillStyle = rgba(fg, (0.07 + rand() * 0.1) * (0.35 + 0.95 * t));
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rgba(fg, 0.32);
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}

// Connection lines between a ring of nodes, with intersection dots.
function geometricConnections(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  rand: () => number,
) {
  ctx.save();
  const nodes: [number, number][] = [];
  const n = 4 + ((rand() * 4) | 0);
  for (let i = 0; i < n; i++)
    nodes.push([W * (0.1 + rand() * 0.8), H * (0.1 + rand() * 0.8)]);
  ctx.strokeStyle = rgba(fg, 0.42);
  ctx.lineWidth = Math.max(0.8, W * 0.001);
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(fg, 0.9);
  const dot = Math.max(2.5, W * 0.005);
  for (const [x, y] of nodes) {
    ctx.beginPath();
    ctx.arc(x, y, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderGeometric(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  effect: Effect | "none",
  W: number,
  H: number,
  fg: string,
  bg: string,
  intensity: number,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  geometricGrid(ctx, W, H, fg, rand);
  geometricFields(ctx, W, H, fg, intensity, rand);
  // The base geometry, drawn hard-edged in the foreground colour.
  if (geometry === "radial") drawRadial(ctx, W, H, fg, rand);
  else if (geometry === "ripple") drawRipple(ctx, W, H, fg, rand);
  else if (geometry === "lines") drawLines(ctx, W, H, fg, rand);
  else if (geometry === "string") drawString(ctx, W, H, fg, rand);
  else drawWave(ctx, W, H, fg, rand);
  geometricConnections(ctx, W, H, fg, rand);
  applyEffect(ctx, effect, W, H, fg, bg, rand);
  addGrain(ctx, W, H, rand, 0.05); // restrained — keep it crisp
}

// Bottom-left "MAI-Image-2.5" watermark applied to every generated image.
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
) {
  const fs = Math.max(11, Math.round(W * 0.0135));
  ctx.font = "600 " + fs + 'px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textBaseline = "alphabetic";
  const pad = Math.round(W * 0.022);
  ctx.fillStyle = rgba(fg, 0.55);
  ctx.fillText("MAI-Image-2.5", pad, H - pad);
}

/* ---------- orchestration ---------- */

export function paint(
  style: Style,
  geometry: Geometry,
  effect: Effect | "none",
  fg: string,
  bg: string,
  intensity: number,
  w: number,
  h: number,
  seed: number,
  stamp: boolean,
): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const rand = mulberry32(seed >>> 0);
  if (style === "atmospheric")
    renderAtmospheric(ctx, geometry, effect, w, h, fg, bg, intensity, rand);
  else renderGeometric(ctx, geometry, effect, w, h, fg, bg, intensity, rand);
  if (stamp) drawStamp(ctx, w, h, fg);
  return c.toDataURL("image/png");
}

// 160×160 style thumbnails — each style shown with a representative geometry.
// Thumbnails use the default intensity so they stay stable while the slider moves.
export function makeStyleSwatches(fg: string, bg: string): Record<Style, string> {
  const I = DEFAULT_INTENSITY;
  return {
    atmospheric: paint("atmospheric", "ripple", "none", fg, bg, I, 160, 160, hash("sty-atmo"), false),
    geometric: paint("geometric", "radial", "dataviz", fg, bg, I, 160, 160, hash("sty-geo"), false),
  };
}

// 160×160 geometry thumbnails (no effect), reflecting current style + colors.
export function makeGeometrySwatches(
  style: Style,
  fg: string,
  bg: string,
): Record<Geometry, string> {
  const out = {} as Record<Geometry, string>;
  for (const { key } of GEOMETRIES)
    out[key] = paint(style, key, "none", fg, bg, DEFAULT_INTENSITY, 160, 160, hash("geo-" + style + key), false);
  return out;
}

// 160×160 effect thumbnails — each effect over a sample geometry, in style.
export function makeEffectSwatches(
  style: Style,
  fg: string,
  bg: string,
): Record<Effect, string> {
  const out = {} as Record<Effect, string>;
  for (const { key } of EFFECTS)
    out[key] = paint(style, EFFECT_SAMPLE_GEOM, key, fg, bg, DEFAULT_INTENSITY, 160, 160, hash("eff-" + style + key), false);
  return out;
}

// 880×880 live base preview (no watermark) — style + geometry + effect + intensity.
export function makeBasePreview(
  style: Style,
  geometry: Geometry,
  effect: Effect,
  fg: string,
  bg: string,
  intensity: number,
): string {
  return paint(style, geometry, effect, fg, bg, intensity, 880, 880, hash("base-" + style + geometry + effect), false);
}

// Procedural fallback for Generate: N stamped 1080×1080 samples.
export function generateSamples(
  style: Style,
  geometry: Geometry,
  effect: Effect,
  fg: string,
  bg: string,
  intensity: number,
  feeling: string,
  heading: string,
  n: number,
  nonce: number,
): string[] {
  const samples: string[] = [];
  for (let i = 0; i < n; i++) {
    const seed = hash(
      [style, feeling, heading, geometry, effect, fg + bg, intensity, nonce, i].join("|"),
    );
    samples.push(paint(style, geometry, effect, fg, bg, intensity, 1080, 1080, seed, true));
  }
  return samples;
}

// Procedural fallback for the free-form edit box: when no edit model is
// configured, derive a fresh composition *directionally* from the typed
// instruction. Like the real edit pass, it ignores the option-bar selectors and
// responds to the instruction alone — style, geometry and effect are picked
// deterministically from the instruction text, while colours and intensity carry
// over from the image being edited so the result stays coherent.
export function generateEditFallback(
  instruction: string,
  fg: string,
  bg: string,
  intensity: number,
  nonce: number,
): string {
  const h = hash("edit|" + instruction + "|" + nonce);
  const style = STYLES[h % STYLES.length].key;
  const geometry = GEOMETRIES[(h >>> 4) % GEOMETRIES.length].key;
  const effect = EFFECTS[(h >>> 8) % EFFECTS.length].key;
  return paint(style, geometry, effect, fg, bg, intensity, 1080, 1080, h, true);
}

// Composite the MAI-Image-2.5 watermark onto an already-rendered image
// (e.g. one returned by the real model). Returns a stamped PNG data URL.
export function watermarkDataUrl(srcUrl: string, fg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = img.naturalWidth || 1080;
      const H = img.naturalHeight || 1080;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, W, H);
      drawStamp(ctx, W, H, fg);
      try {
        resolve(c.toDataURL("image/png"));
      } catch {
        // Tainted canvas (cross-origin without CORS) — fall back to raw URL.
        resolve(srcUrl);
      }
    };
    img.onerror = () => reject(new Error("Failed to load generated image"));
    img.src = srcUrl;
  });
}
