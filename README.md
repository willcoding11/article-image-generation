# MAI·Image Studio

A single-page tool for generating abstract editorial artwork to sit beside an
article heading. Pick a **design** (Weave / Chevron / ASCII / Ripple), choose a
**foreground** and **background** color, type a **feeling** and an **article
heading**, then hit **Generate** to produce square (1:1) image variations — each
stamped `MAI-Image-2.5` in the bottom-left. The chosen image previews live next
to the headline, and a history strip collects everything generated.

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
MAI_IMAGE_API_KEY=...                                   # required to use the model
MAI_IMAGE_API_URL=https://<resource>.services.ai.azure.com/mai/v1/images/generations
# MAI_IMAGE_MODEL=MAI-Image-2.5                          # optional, this is the default
```

How it works:

- The endpoint is OpenAI-compatible (`POST` with `Authorization: Bearer`, body
  `{ model, prompt, n, size }`, response `{ data: [{ b64_json }] }`).
- It returns **one image per call** (the `n` param is ignored), so the route
  fans out `variations` parallel calls — each retried once for reliability — and
  combines the results. Images are 1024×1024.
- `buildPrompt()` composes the text prompt from the design style + feeling +
  heading + colors.
- The client (`components/Studio.tsx`) loads each returned image and overlays the
  bottom-left `MAI-Image-2.5` watermark via `watermarkDataUrl()` before
  featuring it.

If the key is unset, or every model call fails, `/api/generate` returns
`{ mode: "fallback" }` and the client renders procedurally via the canvas
generators — so the studio always works.

## Project layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Renders `<Studio variations={3} />` |
| `app/layout.tsx` | Root layout + Newsreader font |
| `app/globals.css` | Resets, shimmer keyframe, scrollbar, hover states |
| `components/Studio.tsx` | The full single-screen UI + state model (client) |
| `lib/generators.ts` | Canvas generators, watermark, fallback generation |
| `app/api/generate/route.ts` | Server route — the MAI-Image-2.5 seam |

## Configuration

- `variations` (prop in `app/page.tsx`): samples per generate, clamped 2–4,
  default 3.

## Deploy

Deploys cleanly to Vercel/Netlify. Set `MAI_IMAGE_API_KEY` as an environment
variable in your host's project settings (never commit it).
