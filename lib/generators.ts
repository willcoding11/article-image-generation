// MAI·Image Studio — procedural canvas generators.
//
// Ported faithfully from the design prototype. These run client-side only
// (they need a real <canvas>). They serve two roles:
//   1. Design thumbnails + the live "base preview" (always procedural).
//   2. A fallback for the Generate action when the real MAI-Image-2.5 model
//      is not configured — see components/Studio.tsx.
//
// When the real model is wired in (app/api/generate/route.ts), keep using
// drawStamp / watermarkDataUrl so generated images carry the same
// bottom-left MAI-Image-2.5 stamp.

export type Design = "weave" | "chevron" | "ascii" | "ripple" | "lines";

export const DESIGNS: { key: Design; label: string }[] = [
  { key: "weave", label: "Weave" },
  { key: "chevron", label: "Chevron" },
  { key: "ascii", label: "ASCII" },
  { key: "ripple", label: "Ripple" },
  { key: "lines", label: "Lines" },
];

export const DESIGN_LABELS: Record<Design, string> = {
  weave: "Weave",
  chevron: "Chevron",
  ascii: "ASCII",
  ripple: "Ripple",
  lines: "Lines",
};

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

/* ---------- generators ---------- */

function drawWeave(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const { r, g, b } = hexToRgb(fg);
  const cols = 4 + Math.floor(rand() * 2);
  const cw = W / cols;
  const rows = Math.max(1, Math.round(H / cw));
  const ch = H / rows;
  ctx.lineWidth = Math.max(0.6, W * 0.0008);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = i * cw,
        y0 = j * ch;
      const corner = (i + j + (rand() > 0.5 ? 2 : 0)) % 4;
      const C = [
        [x0, y0],
        [x0 + cw, y0],
        [x0 + cw, y0 + ch],
        [x0, y0 + ch],
      ];
      const px = C[corner][0],
        py = C[corner][1];
      const a = C[(corner + 1) % 4],
        o = C[(corner + 2) % 4],
        bb = C[(corner + 3) % 4];
      const n = 34;
      ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + ",0.5)";
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        let tx, ty;
        if (t < 0.5) {
          const u = t / 0.5;
          tx = a[0] + (o[0] - a[0]) * u;
          ty = a[1] + (o[1] - a[1]) * u;
        } else {
          const u = (t - 0.5) / 0.5;
          tx = o[0] + (bb[0] - o[0]) * u;
          ty = o[1] + (bb[1] - o[1]) * u;
        }
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      const gr = ctx.createRadialGradient(px, py, 0, px, py, cw * 0.5);
      gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",0.55)");
      gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
      ctx.fillStyle = gr;
      ctx.fillRect(x0, y0, cw, ch);
    }
  }
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const { r, g, b } = hexToRgb(fg);
  const segs = 5;
  const cx0 = W * 0.28,
    cw = W * 0.44;
  const top = H * 0.08,
    colH = H * 0.84,
    bh = colH / segs;
  ctx.lineWidth = Math.max(0.6, W * 0.0008);
  const flip = rand() > 0.5 ? 1 : 0;
  for (let k = 0; k < segs; k++) {
    const y0 = top + k * bh,
      y1 = y0 + bh;
    const leftApex = (k + flip) % 2 === 0;
    let apex, p1, p2;
    if (leftApex) {
      apex = [cx0, (y0 + y1) / 2];
      p1 = [cx0 + cw, y0];
      p2 = [cx0 + cw, y1];
    } else {
      apex = [cx0 + cw, (y0 + y1) / 2];
      p1 = [cx0, y0];
      p2 = [cx0, y1];
    }
    const grd = ctx.createLinearGradient(
      apex[0],
      apex[1],
      (p1[0] + p2[0]) / 2,
      (p1[1] + p2[1]) / 2,
    );
    grd.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",0.18)");
    grd.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0.02)");
    ctx.beginPath();
    ctx.moveTo(apex[0], apex[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = grd;
    ctx.fill();
    const n = 46;
    ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + ",0.55)";
    ctx.beginPath();
    for (let m = 0; m <= n; m++) {
      const t = m / n;
      const tx = p1[0] + (p2[0] - p1[0]) * t,
        ty = p1[1] + (p2[1] - p1[1]) * t;
      ctx.moveTo(apex[0], apex[1]);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
  }
}

function drawAscii(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const { r, g, b } = hexToRgb(fg);
  const ramp = " .:-=+*#%@";
  const cols = 58,
    cell = W / cols,
    rows = Math.ceil(H / cell);
  const blobs: { x: number; y: number; r: number; w: number }[] = [];
  const nb = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < nb; i++)
    blobs.push({
      x: rand() * W,
      y: rand() * H,
      r: (0.12 + rand() * 0.3) * W,
      w: 0.6 + rand() * 0.8,
    });
  const gx = rand(),
    gy = rand();
  ctx.textBaseline = "top";
  ctx.font = Math.round(cell * 1.05) + 'px ui-monospace, "SF Mono", Menlo, monospace';
  for (let jy = 0; jy < rows; jy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = ix * cell,
        y = jy * cell;
      let v = 0;
      for (const bl of blobs) {
        const dx = x - bl.x,
          dy = y - bl.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        v += bl.w * Math.max(0, 1 - d / bl.r);
      }
      v += (x / W) * gx * 0.5 + (1 - y / H) * gy * 0.5;
      v = Math.max(0, Math.min(1, v));
      const idx = Math.floor(v * (ramp.length - 1));
      const ch = ramp[idx];
      if (ch === " ") continue;
      ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + (0.35 + 0.6 * v) + ")";
      ctx.fillText(ch, x, y);
    }
  }
}

function drawRipple(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const { r, g, b } = hexToRgb(fg);
  const bands = 4 + Math.floor(rand() * 3);
  const bw = W / bands;
  for (let i = 0; i < bands; i++) {
    if (i % 2 === 0) continue;
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(i * bw, 0, bw, H);
  }
  const cx = W * (0.12 + rand() * 0.12),
    cy = H * (0.4 + rand() * 0.2);
  const rings = 5 + Math.floor(rand() * 4);
  ctx.save();
  for (let i = 1; i <= rings; i++) {
    const rad = (i / rings) * W * 0.95;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, Math.PI / 2);
    ctx.lineWidth = Math.max(6, W * 0.012);
    ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + ",0.85)";
    ctx.shadowColor = "rgba(" + r + "," + g + "," + b + ",0.9)";
    ctx.shadowBlur = W * 0.02;
    ctx.stroke();
  }
  ctx.restore();
  addGrain(ctx, W, H, 0.1);
}

function addGrain(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  amount: number,
) {
  const n = document.createElement("canvas");
  n.width = 180;
  n.height = 180;
  const nc = n.getContext("2d")!;
  const img = nc.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  nc.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = "overlay";
  for (let y = 0; y < H; y += 180)
    for (let x = 0; x < W; x += 180) ctx.drawImage(n, x, y);
  ctx.restore();
}

// Vertical lines of varying weight — thick and thin bands, rhythmically spaced.
function drawLines(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
  bg: string,
  rand: () => number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const { r, g, b } = hexToRgb(fg);
  const baseUnit = W / (30 + Math.floor(rand() * 16)); // spacing scale
  let x = rand() * baseUnit;
  while (x < W) {
    const thick = rand() > 0.6;
    const w = Math.max(
      0.75,
      thick ? baseUnit * (0.45 + rand() * 1.0) : baseUnit * (0.05 + rand() * 0.18),
    );
    const alpha = thick ? 0.5 + rand() * 0.4 : 0.18 + rand() * 0.3;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + alpha + ")");
    grd.addColorStop(1, "rgba(" + r + "," + g + "," + b + "," + alpha * 0.55 + ")");
    ctx.fillStyle = grd;
    ctx.fillRect(x, 0, w, H);
    const gap = baseUnit * (0.25 + rand() * 0.9);
    x += w + gap;
  }
}

// Bottom-left "MAI-Image-2.5" watermark applied to every generated image.
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fg: string,
) {
  const { r, g, b } = hexToRgb(fg);
  const fs = Math.max(11, Math.round(W * 0.0135));
  ctx.font = "600 " + fs + 'px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textBaseline = "alphabetic";
  const pad = Math.round(W * 0.022);
  ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.55)";
  ctx.fillText("MAI-Image-2.5", pad, H - pad);
}

/* ---------- orchestration ---------- */

export function paint(
  design: Design,
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
  if (design === "weave") drawWeave(ctx, w, h, fg, bg, rand);
  else if (design === "chevron") drawChevron(ctx, w, h, fg, bg, rand);
  else if (design === "ascii") drawAscii(ctx, w, h, fg, bg, rand);
  else if (design === "ripple") drawRipple(ctx, w, h, fg, bg, rand);
  else drawLines(ctx, w, h, fg, bg, rand);
  if (stamp) drawStamp(ctx, w, h, fg);
  return c.toDataURL("image/png");
}

// 160×160 thumbnails for the four design buttons, rendered with current colors.
export function makeSwatches(fg: string, bg: string): Record<Design, string> {
  const out = {} as Record<Design, string>;
  for (const { key } of DESIGNS)
    out[key] = paint(key, fg, bg, 160, 160, hash("sw-" + key), false);
  return out;
}

// 880×880 live base preview (no watermark) shown before any generation.
export function makeBasePreview(design: Design, fg: string, bg: string): string {
  return paint(design, fg, bg, 880, 880, hash("base-" + design), false);
}

// Procedural fallback for Generate: N stamped 1080×1080 samples.
export function generateSamples(
  design: Design,
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
      feeling + "|" + heading + "|" + design + "|" + fg + bg + "|" + nonce + "|" + i,
    );
    samples.push(paint(design, fg, bg, 1080, 1080, seed, true));
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
