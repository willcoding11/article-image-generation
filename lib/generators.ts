// MAI·Image Studio — procedural canvas generators.
//
// Compositions are built progressively:  GEOMETRY (a base shape/pattern)
// → EFFECT (a loose treatment applied on top) → COLOR.  These run client-side
// only (they need a real <canvas>) and drive the thumbnails, the live base
// preview, and the procedural fallback. The real output comes from
// MAI-Image-2.5 (app/api/generate/route.ts), which is prompted in the same
// geometry → effect → color order.

export type Geometry = "radial" | "ripple" | "lines" | "string" | "wave";
export type Effect = "glow" | "ascii" | "dataviz" | "repeat" | "minimal";

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
  { name: "Ink", color: "#1a1a1a" },
];

export const BG_SWATCHES = [
  { name: "Paper", color: "#f4f1ea" },
  { name: "Cream", color: "#f7ecd6" },
  { name: "Marigold", color: "#f1b24a" },
  { name: "Mist", color: "#e9efe9" },
  { name: "Periwinkle", color: "#eceefb" },
  { name: "Blush", color: "#f7e7e4" },
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

function renderGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: Geometry,
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (geometry === "radial") drawRadial(ctx, W, H, fg, rand);
  else if (geometry === "ripple") drawRipple(ctx, W, H, fg, rand);
  else if (geometry === "lines") drawLines(ctx, W, H, fg, rand);
  else if (geometry === "string") drawString(ctx, W, H, fg, rand);
  else drawWave(ctx, W, H, fg, rand);
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
  geometry: Geometry,
  effect: Effect | "none",
  fg: string,
  bg: string,
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
  renderGeometry(ctx, geometry, w, h, fg, bg, rand);
  applyEffect(ctx, effect, w, h, fg, bg, rand);
  if (stamp) drawStamp(ctx, w, h, fg);
  return c.toDataURL("image/png");
}

// 160×160 geometry thumbnails (no effect), reflecting current colors.
export function makeGeometrySwatches(fg: string, bg: string): Record<Geometry, string> {
  const out = {} as Record<Geometry, string>;
  for (const { key } of GEOMETRIES)
    out[key] = paint(key, "none", fg, bg, 160, 160, hash("geo-" + key), false);
  return out;
}

// 160×160 effect thumbnails — each effect shown over a sample geometry.
export function makeEffectSwatches(fg: string, bg: string): Record<Effect, string> {
  const out = {} as Record<Effect, string>;
  for (const { key } of EFFECTS)
    out[key] = paint(EFFECT_SAMPLE_GEOM, key, fg, bg, 160, 160, hash("eff-" + key), false);
  return out;
}

// 880×880 live base preview (no watermark) — selected geometry + effect.
export function makeBasePreview(
  geometry: Geometry,
  effect: Effect,
  fg: string,
  bg: string,
): string {
  return paint(geometry, effect, fg, bg, 880, 880, hash("base-" + geometry + effect), false);
}

// Procedural fallback for Generate: N stamped 1080×1080 samples.
export function generateSamples(
  geometry: Geometry,
  effect: Effect,
  fg: string,
  bg: string,
  feeling: string,
  heading: string,
  n: number,
  nonce: number,
): string[] {
  const samples: string[] = [];
  for (let i = 0; i < n; i++) {
    const seed = hash(
      [feeling, heading, geometry, effect, fg + bg, nonce, i].join("|"),
    );
    samples.push(paint(geometry, effect, fg, bg, 1080, 1080, seed, true));
  }
  return samples;
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
