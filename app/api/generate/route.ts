import type { Style, Geometry, Effect } from "@/lib/generators";

// Image generation can take 10–30s for several variations; allow headroom on
// serverless hosts (e.g. Vercel) where the default function timeout is short.
export const maxDuration = 60;

// POST /api/generate
//
// Body: { style, geometry, effect, fg, bg, feeling, heading, variations, nonce }
// Returns one of:
//   { mode: "model",    images: string[] }  — real MAI-Image-2.5 output
//   { mode: "fallback" }                    — client should render procedurally
//
// The MAI-Image-2.5 API key lives ONLY here on the server (env: MAI_IMAGE_API_KEY)
// and is never shipped to the browser. Until the key + API are configured, every
// request returns `fallback` so the studio keeps working via the canvas generators.

type GenerateBody = {
  style: Style;
  geometry: Geometry;
  effect: Effect;
  fg: string;
  bg: string;
  intensity: number; // 0–1: how strongly the foreground saturates the ground
  feeling: string;
  heading: string;
  variations: number;
  nonce: number;
};

// Step 0 — the overall style. This is the leading aesthetic: it frames the
// whole composition and decides what the geometry/effect/color steps build
// toward. Each style carries its own positive vocabulary and its own negatives.
const STYLE_PROMPTS: Record<
  Style,
  { pre: string; positive: string; negative: string }
> = {
  atmospheric: {
    pre: "STYLE — Atmospheric Minimalism: a quiet, contemplative, editorial composition where behaviour itself is the meaning. Atmosphere generated from one simple system: soft diffusion, airbrushed gradients, controlled glow, a few minimal geometric primitives, large negative space, very low visual noise. A single governing idea expressed through sequential transformation and systematic repetition.",
    positive:
      "Lean on diffusion, glow, density, soft gradients, emergence, propagation, repetition, soft boundaries, temporal sampling and field effects, over a warm ground carrying fine film-like grain. It should feel elegant, speculative and conceptual — communicating adoption, learning, growth and emergence.",
    negative:
      "For this style, avoid hard-edged structure, rigid grids, dense linework, charts, diagrams, busy detail or illustration — keep it soft, sparse and atmospheric.",
  },
  geometric: {
    pre: "STYLE — Abstract Geometric Modernism: an intelligent, systematic, analytical composition that expresses relationships, structures, constraints and flows through precise forms. Hard-edged geometry and mathematical curves, constructed compositions with visible underlying logic, layered transparent fields, structural relationships and a strictly limited palette. Precision over expression, systems over objects, order over spontaneity.",
    positive:
      "Build from circles, arcs, grids, radial constructions, modular blocks, coordinate systems, layered rectangles, connection lines, geometric intersections and transparency fields. It should read as institutional, strategic, rational and confident.",
    negative:
      "For this style, avoid organic expression, painterly or gestural marks, chaotic forms, decorative ornament and surrealism — keep every form deliberate and constructed.",
  },
};

// Step 1 — the base geometry / structure.
const GEOMETRY_PROMPTS: Record<Geometry, string> = {
  radial: "a field of concentric radial contour lines, like a topographic map or radar sweep",
  ripple: "concentric ripples and arcs radiating out from a point",
  lines: "vertical lines of varying weight — thick and thin bands, rhythmically spaced",
  string: "string-art geometry — straight lines spanning between points to trace curved envelopes",
  wave: "layered signal waves and sine curves, an oscilloscope-like waveform",
};

// Step 2 — a loose effect / treatment applied over the geometry.
const EFFECT_PROMPTS: Record<Effect, string> = {
  glow: "a soft luminous gradient glow, like a glowing signal",
  ascii: "an ASCII / dot-matrix character field",
  dataviz: "the look of an abstract data visualization — graph marks, ticks, plotted points",
  repeat: "tiled into a repeating modular pattern",
  minimal: "stripped back to minimalism, lots of negative space and only the essential marks",
};

// Leading framing — pushes toward a flat graphic, not a material/photo. Kept
// style-neutral so it frames both styles without forcing linework on the soft
// Atmospheric look. (The anti-material constraint is a hard requirement.)
const PRE_PROMPT =
  "Flat, graphic editorial illustration — a stylized, designed composition in a screen-print / risograph spirit: a limited flat palette, visible marks and grain, a paper-like ground. This is a designed graphic, not a photograph and not a physical material.";

// Trailing negative prompt (after the user input) — kills realism AND material look.
const NEGATIVE_PROMPT =
  "Avoid anything photographic, lifelike, or material: no photorealism, no photography, no 3D render or CGI, no realistic or volumetric lighting, no depth-of-field or lens blur, no smoke or haze, no glossy reflections; and crucially NOT a woven fabric, textile, cloth, basket, threads or fibers, or any physical material / surface texture. Keep it 2D, flat, graphic, and diagrammatic.";

// preprompt → style → geometry → effect → color → content → negatives
function buildPrompt(b: GenerateBody): string {
  const mood = b.feeling.trim();
  const headline = b.heading.trim();
  const style = STYLE_PROMPTS[b.style] ?? STYLE_PROMPTS.atmospheric;
  const t = typeof b.intensity === "number" ? b.intensity : 0.8;
  const fieldDesc =
    t > 0.66
      ? "Let the foreground colour read bold and saturated over the ground, with strong contrast in the gradient"
      : t > 0.33
        ? "Let the foreground and ground meet in a balanced, even gradient"
        : "Keep the foreground colour pale and restrained, barely tinting the ground, with lots of soft empty space";
  return [
    PRE_PROMPT,
    style.pre,
    style.positive,
    `Abstract editorial artwork, square 1:1. Within that style, start from ${GEOMETRY_PROMPTS[b.geometry]} as the underlying structure.`,
    `Then treat it loosely with ${EFFECT_PROMPTS[b.effect]} — applied gently in service of the style, not literally. Interpret freely and vary the composition each time.`,
    `Build the palette around ${b.fg} and ${b.bg}, with freedom to explore related tones, tints, and shades. ${fieldDesc}.`,
    mood ? `Evoke a feeling of ${mood}.` : "",
    headline
      ? `It accompanies an article titled “${headline}” — let the title inspire the mood while staying fully abstract.`
      : "",
    "No text, letters, words, or logos.",
    NEGATIVE_PROMPT,
    style.negative,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function POST(request: Request) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return Response.json({ mode: "fallback", error: "Invalid request body" }, { status: 400 });
  }

  const apiKey = process.env.MAI_IMAGE_API_KEY;
  if (!apiKey) {
    // No model configured yet — render procedurally on the client.
    return Response.json({ mode: "fallback" });
  }

  try {
    const images = await generateWithMaiImage(body, apiKey);
    return Response.json({ mode: "model", images });
  } catch (err) {
    console.error("MAI-Image-2.5 generation failed:", err);
    // Degrade gracefully rather than failing the request.
    return Response.json({ mode: "fallback", error: String(err) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAI-Image-2.5 (Azure AI) — OpenAI-compatible images/generations endpoint.
//
// Returns an array of image data URLs. The endpoint produces ONE image per call
// (the `n` parameter is ignored), so we fan out `variations` parallel calls and
// keep whichever succeed. The client (components/Studio.tsx) overlays the
// bottom-left "MAI-Image-2.5" watermark on each before featuring it.
// ─────────────────────────────────────────────────────────────────────────────
const MODEL = process.env.MAI_IMAGE_MODEL || "MAI-Image-2.5";
// Endpoint URL is not a secret; default to the known endpoint so only the API
// key needs to be configured. Override via MAI_IMAGE_API_URL for other resources.
const ENDPOINT =
  process.env.MAI_IMAGE_API_URL ||
  "https://mai-image-testing.services.ai.azure.com/mai/v1/images/generations";
const SIZE = "1024x1024"; // square, matching the studio's 1:1 composition

// One image. The test endpoint occasionally drops a concurrent request, so we
// retry once on failure to reliably fill the requested batch.
async function generateOne(
  prompt: string,
  apiKey: string,
  attempts = 2,
): Promise<string | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, prompt, n: 1, size: SIZE }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        data?: { b64_json?: string; url?: string }[];
      };
      const item = json?.data?.[0];
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
      if (item?.url) return item.url;
      return null;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

async function generateWithMaiImage(
  body: GenerateBody,
  apiKey: string,
): Promise<string[]> {
  if (!ENDPOINT) throw new Error("MAI_IMAGE_API_URL is not set");
  const prompt = buildPrompt(body);
  const count = Math.max(1, Math.min(4, body.variations || 3));

  const results = await Promise.allSettled(
    Array.from({ length: count }, () => generateOne(prompt, apiKey)),
  );
  const images = results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is string => Boolean(v));

  if (images.length === 0) {
    const failed = results.find((r) => r.status === "rejected");
    throw new Error(
      failed ? String((failed as PromiseRejectedResult).reason) : "No images returned",
    );
  }
  return images;
}
