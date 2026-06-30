import type { Aspect } from "@/lib/generators";
import { editImage, hasModelKey, hasEditEndpoint, classifyFailure, UNCONFIGURED } from "@/lib/maiImage";

export const maxDuration = 60;

// POST /api/edit
//
// Body: { image, instruction, aspect? }
// Returns one of:
//   { mode: "model",    image: string }  — edited MAI-Image-2.5 output
//   { mode: "fallback", ...reason }      — client should edit procedurally
//
// Free-form edit of the currently displayed image. This DELIBERATELY ignores the
// style / geometry / effect / colour selectors — it acts on the given image plus
// the typed instruction alone. Requires an edits endpoint (MAI_IMAGE_EDIT_URL);
// otherwise it degrades to the procedural client path.

type EditBody = { image: string; instruction: string; aspect?: Aspect };

const FRAME_HINT: Partial<Record<Aspect, string>> = {
  "9:16": "tall vertical (9:16) portrait",
  "2:3": "vertical (2:3) portrait",
  "16:9": "wide (16:9) landscape",
};

export async function POST(request: Request) {
  let body: EditBody;
  try {
    body = (await request.json()) as EditBody;
  } catch {
    return Response.json({ mode: "fallback", error: "Invalid request body" }, { status: 400 });
  }

  const instruction = (body.instruction || "").trim();
  if (!hasModelKey() || !hasEditEndpoint() || !body.image || !instruction) {
    return Response.json({ mode: "fallback", ...UNCONFIGURED });
  }

  try {
    const framing = body.aspect && FRAME_HINT[body.aspect]
      ? `The result will be centre-cropped to a ${FRAME_HINT[body.aspect]} frame, so keep the key composition centred and away from the edges.`
      : "";
    const prompt = [
      "Edit this image as instructed below, keeping it a flat, graphic, abstract editorial illustration (not a photo, not a material).",
      instruction,
      framing,
      "No text, letters, words, or logos.",
    ].filter(Boolean).join(" ");
    const image = await editImage(body.image, prompt);
    if (!image) return Response.json({ mode: "fallback", ...UNCONFIGURED });
    return Response.json({ mode: "model", image });
  } catch (err) {
    console.error("MAI-Image-2.5 edit failed:", err);
    return Response.json({ mode: "fallback", ...classifyFailure(err), error: String(err) });
  }
}
