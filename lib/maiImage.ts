// Server-only MAI-Image-2.5 helpers shared by the API routes.
//
// Auth + call shape match the PROVEN-working production setup: the model accepts
// `Authorization: Bearer <key>` with this resource (verified against the live
// endpoint), so we keep that rather than switching to the docs' `api-key` header.
//
// This module adds two things on top of /api/generate's own text-to-image calls:
//   • editImage()      — image-to-image edits (the edit box + opt-in refine pass)
//   • classifyFailure()— turns an upstream error into a friendly fallback reason
// The API key lives ONLY on the server (env: MAI_IMAGE_API_KEY).

const MODEL = process.env.MAI_IMAGE_MODEL || "MAI-Image-2.5";

// Image-to-image edits endpoint. OPT-IN: unset by default, so the edit box and
// the phased refine degrade gracefully (procedural / single-shot) until it's
// configured. Defaults next to the generations endpoint when only the base URL
// is overridden.
const EDIT_ENDPOINT =
  process.env.MAI_IMAGE_EDIT_URL ||
  (process.env.MAI_IMAGE_API_URL
    ? process.env.MAI_IMAGE_API_URL.replace("/generations", "/edits")
    : "");

const SIZE = "1024x1024";

export function hasModelKey(): boolean {
  return Boolean(process.env.MAI_IMAGE_API_KEY);
}

export function hasEditEndpoint(): boolean {
  return Boolean(EDIT_ENDPOINT);
}

function authHeaders(): Record<string, string> {
  const k = process.env.MAI_IMAGE_API_KEY;
  if (!k) throw new Error("MAI_IMAGE_API_KEY is not set");
  return { Authorization: `Bearer ${k}` };
}

// Image + prompt → edited image (OpenAI-compatible images/edits, multipart).
// Returns null when no edit endpoint is configured so callers can fall back.
export async function editImage(
  imageUrl: string,
  prompt: string,
  attempts = 2,
): Promise<string | null> {
  if (!EDIT_ENDPOINT) return null;
  const res0 = await fetch(imageUrl);
  if (!res0.ok) throw new Error(`Failed to load source image: HTTP ${res0.status}`);
  const blob = await res0.blob();

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const form = new FormData();
      form.append("model", MODEL);
      form.append("prompt", prompt);
      form.append("image", blob, "image.png");
      const res = await fetch(EDIT_ENDPOINT, {
        method: "POST",
        headers: authHeaders(), // fetch sets the multipart boundary itself
        body: form,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
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

// A user-facing reason for a fallback, surfaced as a toast in the client.
// `tone` is "warn" for genuine failures, "info" for the expected not-configured
// case (the studio runs on the procedural canvas).
export type Fallback = {
  reason: "unconfigured" | "rate_limit" | "auth" | "content" | "timeout" | "error";
  message: string;
  tone: "warn" | "info";
};

export const UNCONFIGURED: Fallback = {
  reason: "unconfigured",
  message: "Preview mode — no model key configured.",
  tone: "info",
};

// Map a thrown model error to a friendly fallback reason. Errors thrown by the
// fetch helpers carry the upstream status as "HTTP <code>: <detail>".
export function classifyFailure(err: unknown): Fallback {
  const text = String((err as { message?: string })?.message ?? err);
  const status = text.match(/HTTP (\d{3})/)?.[1];

  if (status === "429")
    return { reason: "rate_limit", message: "Too many requests — try again in a minute.", tone: "warn" };
  if (status === "401" || status === "403")
    return { reason: "auth", message: "Authentication failed — check the API key.", tone: "warn" };
  if (status === "400" || status === "422") {
    if (/content[_ ]?safety|content[_ ]?filter|blocklist|policy|moderation|blocked|guideline|responsible\s*ai/i.test(text))
      return { reason: "content", message: "Blocked by content guidelines — try different wording.", tone: "warn" };
    return { reason: "error", message: "The model rejected the request — adjust your inputs and retry.", tone: "warn" };
  }
  if (/abort|timeout|ETIMEDOUT|network|fetch failed|ENOTFOUND|ECONNRESET/i.test(text))
    return { reason: "timeout", message: "Couldn’t reach the model — please try again.", tone: "warn" };

  return { reason: "error", message: "Image model unavailable — showing a procedural preview.", tone: "warn" };
}
