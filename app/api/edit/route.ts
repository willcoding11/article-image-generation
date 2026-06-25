import { editImage, hasModelKey, hasEditEndpoint, classifyFailure, UNCONFIGURED } from "@/lib/maiImage";

export const maxDuration = 60;

// POST /api/edit
//
// Body: { image, instruction }
// Returns one of:
//   { mode: "model",    image: string }  — edited MAI-Image-2.5 output
//   { mode: "fallback", ...reason }      — client should edit procedurally
//
// Free-form edit of the currently displayed image. This DELIBERATELY ignores the
// style / geometry / effect / colour selectors — it acts on the given image plus
// the typed instruction alone. Requires an edits endpoint (MAI_IMAGE_EDIT_URL);
// otherwise it degrades to the procedural client path.

type EditBody = { image: string; instruction: string };

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
    const prompt = [
      "Edit this image as instructed below, keeping it a flat, graphic, abstract editorial illustration (not a photo, not a material).",
      instruction,
      "No text, letters, words, or logos.",
    ].join(" ");
    const image = await editImage(body.image, prompt);
    if (!image) return Response.json({ mode: "fallback", ...UNCONFIGURED });
    return Response.json({ mode: "model", image });
  } catch (err) {
    console.error("MAI-Image-2.5 edit failed:", err);
    return Response.json({ mode: "fallback", ...classifyFailure(err), error: String(err) });
  }
}
