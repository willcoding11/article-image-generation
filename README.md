# MAI·Image Studio

A single-page tool for generating abstract editorial artwork to sit beside an
article heading. Pick a **style** (Atmospheric / Geometric), a **geometry**, an
**effect**, **foreground** and **background** colors, and an **intensity**; type
a **feeling** and an **article heading**, then hit **Generate** to produce square
(1:1) image variations — each stamped `MAI-Image-2.5` in the bottom-left. The
chosen image previews live next to the headline, a text box lets you **edit the
current image** with a free-form instruction, and a history strip collects
everything generated.

Built with **Next.js 16** (App Router) + **React 19**. Recreated from the design
handoff prototype.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Out of the box the app runs on the **procedural canvas fallback** — no API key
needed. The four designs are drawn on an HTML canvas (see `lib/generators.ts`).

## MAI-Image-2.5 integration

The real image model is wired up in
[`app/api/generate/route.ts`](app/api/generate/route.ts) and called
**server-side only**, so the API key never reaches the browser.

Configure it in `.env.local`:

```bash
MAI_IMAGE_API_KEY=...           # required — the only secret you must set
# MAI_IMAGE_API_URL=...         # optional — generations endpoint; defaults to the known resource
# MAI_IMAGE_EDIT_URL=...        # optional — image-edit endpoint; enables the edit box + phased refine
# MAI_IMAGE_MODEL=MAI-Image-2.5 # optional — the deployment name; this is the default
```

How it works:

- `POST` with `Authorization: Bearer <key>` (the resource accepts the key as a
  bearer token), body `{ model, prompt, n, size }`, response `{ data: [{ b64_json }] }`.
- It returns **one image per call**, so the route fans out `variations` parallel
  calls — each retried once for reliability — and combines the results (1024×1024).
- `buildPrompt()` composes the prompt from **style → geometry → effect → color**,
  with the chosen intensity tuning the foreground/background gradient.
- **Phased generation (opt-in):** when `MAI_IMAGE_PHASED=1` **and** an edit
  endpoint is configured, each variation is generated in two steps — a hidden
  monochrome base, then a recolor + effect edit pass for tighter fidelity. Off by
  default (single prompt), because it doubles the model calls and MAI-Image-2.5's
  rate limit is tight. Setting `MAI_IMAGE_EDIT_URL` for the edit box alone does
  **not** turn this on.
- The client (`components/Studio.tsx`) overlays the bottom-left `MAI-Image-2.5`
  watermark via `watermarkDataUrl()` before featuring each image.

`/api/edit` performs a free-form image-to-image edit on the current image from a
typed instruction (ignoring the option-bar selectors); requires `MAI_IMAGE_EDIT_URL`.

If the key is unset, or a call fails, the routes return `{ mode: "fallback", … }`
with a reason and the client renders procedurally (and shows a brief toast
explaining why) — so the studio always works.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Renders `<Studio variations={3} />` |
| `app/layout.tsx` | Root layout + Newsreader font |
| `app/globals.css` | Resets, shimmer keyframe, scrollbar, hover states |
| `components/Studio.tsx` | The full single-screen UI + state model (client) |
| `lib/generators.ts` | Canvas generators, watermark, fallback generation |
| `lib/maiImage.ts` | Server-only MAI-Image-2.5 edit calls + fallback reasons |
| `app/api/generate/route.ts` | Server route — generation (single-shot / phased) |
| `app/api/edit/route.ts` | Server route — free-form image-to-image edit |

## Configuration

- `variations` (prop in `app/page.tsx`): samples per generate, clamped 2–4,
  default 3.

## Deploy

Deploys cleanly to Vercel/Netlify. Set `MAI_IMAGE_API_KEY` as an environment
variable in your host's project settings (never commit it).
