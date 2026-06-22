import type { Geometry, Effect } from "@/lib/generators";

// Image generation can take 10–30s for several variations; allow headroom on
// serverless hosts (e.g. Vercel) where the default function timeout is short.
export const maxDuration = 60;

// POST /api/generate
//
// Body: { geometry, effect, fg, bg, feeling, heading, variations, nonce }
// Returns one of:
//   { mode: "model",    images: string[] }  — real MAI-Image-2.5 output
//   { mode: "fallback" }                    — client should render procedurally
//
// The MAI-Image-2.5 API key lives ONLY here on the server (env: MAI_IMAGE_API_KEY)
// and is never shipped to the browser. Until the key + API are configured, every
// request returns `fallback` so the studio keeps working via the canvas generators.

type GenerateBody = {
  geometry: Geometry;
  effect: Effect;
  fg: string;
  bg: string;
  feeling: string;
  heading: string;
  variations: number;
  nonce: number;
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

// Leading style framing — pushes toward a flat graphic, not a material/photo.
const PRE_PROMPT =
  "Flat, graphic editorial illustration — a stylized geometric composition in a screen-print / risograph spirit: bold flat shapes, clean linework, visible marks and grain, a limited flat palette, paper-like ground. This is a designed graphic, not a photograph and not a physical material.";

// Trailing negative prompt (after the user input) — kills realism AND material look.
const NEGATIVE_PROMPT =
  "Avoid anything photographic, lifelike, or material: no photorealism, no photography, no 3D render or CGI, no realistic or volumetric lighting, no depth-of-field or lens blur, no smoke or haze, no glossy reflections; and crucially NOT a woven fabric, textile, cloth, basket, threads or fibers, or any physical material / surface texture. Keep it 2D, flat, graphic, and diagrammatic.";

// preprompt → geometry → effect → color → content → negative prompt
function buildPrompt(b: GenerateBody): string {
  const mood = b.feeling.trim();
  const headline = b.heading.trim();
  return [
    PRE_PROMPT,
    `Abstract editorial artwork, square 1:1. Start from ${GEOMETRY_PROMPTS[b.geometry]} as the underlying structure.`,
    `Then treat it loosely with ${EFFECT_PROMPTS[b.effect]} — applied gently as an effect, not literally. Interpret freely and vary the composition each time.`,
    `Build the palette around ${b.fg} and ${b.bg}, with freedom to explore related tones, tints, and shades.`,
    mood ? `Evoke a feeling of ${mood}.` : "",
    headline
      ? `It accompanies an article titled “${headline}” — let the title inspire the mood while staying fully abstract.`
      : "",
    "No text, letters, words, or logos.",
    NEGATIVE_PROMPT,
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
