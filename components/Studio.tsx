"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import {
  type Style,
  type Geometry,
  type Effect,
  type Aspect,
  STYLES,
  GEOMETRIES,
  EFFECTS,
  ASPECTS,
  STYLE_LABELS,
  STYLE_FULL,
  GEOMETRY_LABELS,
  EFFECT_LABELS,
  DEFAULT_INTENSITY,
  FG_SWATCHES,
  BG_SWATCHES,
  makeStyleSwatches,
  makeGeometrySwatches,
  makeEffectSwatches,
  makeBasePreview,
  generateSamples,
  generateEditFallback,
  watermarkDataUrl,
} from "@/lib/generators";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SANS = "Helvetica, Arial, sans-serif";
const SERIF = "var(--font-newsreader), serif";

const sectionLabelStyle: React.CSSProperties = {
  font: `600 11px/1 ${SANS}`,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#9a968d",
  marginBottom: 11,
};

type HistoryItem = { url: string; label: string };

// Max images kept in the history strip. Each item is a multi-MB PNG data URL,
// so this exists to bound browser memory; tune higher if needed.
const HISTORY_LIMIT = 100;

// Reusable 64px thumbnail picker (used for both Geometry and Effect).
function ThumbPicker({
  title,
  items,
  swatches,
  selectedKey,
  onSelect,
}: {
  title: string;
  items: { key: string; label: string }[];
  swatches: Record<string, string> | null;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div>
      <div style={sectionLabelStyle}>{title}</div>
      <div style={{ display: "flex", gap: 10 }}>
        {items.map(({ key, label }) => {
          const selected = key === selectedKey;
          const preview = swatches?.[key];
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              title={label}
              style={{
                position: "relative",
                width: 64,
                height: 64,
                padding: 0,
                margin: 0,
                border: "1px solid #ece9e2",
                background: "#fff",
                cursor: "pointer",
                overflow: "hidden",
                display: "block",
              }}
            >
              {preview && (
                <img
                  src={preview}
                  alt=""
                  style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                />
              )}
              <span
                style={{
                  position: "absolute",
                  left: 6,
                  bottom: 5,
                  font: `600 8px/1 ${SANS}`,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#fff",
                  mixBlendMode: "difference",
                }}
              >
                {label}
              </span>
              {selected && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    border: "2px solid #161512",
                    // Inner white halo so the ring also stands out on
                    // dark-background thumbnails (e.g. Black/Slate bg).
                    boxShadow: "inset 0 0 0 1px #ffffff",
                    pointerEvents: "none",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Studio({ variations = 3 }: { variations?: number }) {
  // Defaults evoke the Atmospheric Minimalism reference: warm ember on cream,
  // ripple geometry + glow effect → propagating arcs over a soft warm field.
  const [style, setStyle] = useState<Style>("atmospheric");
  const [geometry, setGeometry] = useState<Geometry>("ripple");
  const [effect, setEffect] = useState<Effect>("glow");
  const [fg, setFg] = useState("#e0792a");
  const [bg, setBg] = useState("#f7ecd6");
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [feeling, setFeeling] = useState("");
  // Heading is no longer collected from the UI but still threaded to the API
  // (when empty, the prompt builder skips the "accompanies an article…" clause).
  const heading = "";
  const [samples, setSamples] = useState<string[]>([]);
  const [featuredUrl, setFeaturedUrl] = useState<string | null>(null);
  // When true, the featured area shows the live procedural base preview instead
  // of the current generated/selected sample — so changing settings after a
  // generation gives immediate visual feedback. Cleared by run / selectSample /
  // loadHistory; set by any setting that affects the canvas preview.
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "warn" | "info"; id: number } | null>(null);
  const [styleSwatches, setStyleSwatches] = useState<Record<Style, string> | null>(null);
  const [geomSwatches, setGeomSwatches] = useState<Record<Geometry, string> | null>(null);
  const [effectSwatches, setEffectSwatches] = useState<Record<Effect, string> | null>(null);
  const [basePreview, setBasePreview] = useState<string | null>(null);

  // Style thumbnails depend only on the colors.
  useEffect(() => {
    setStyleSwatches(makeStyleSwatches(fg, bg));
  }, [fg, bg]);

  // Geometry + effect thumbnails reflect the current style and colors.
  useEffect(() => {
    setGeomSwatches(makeGeometrySwatches(style, fg, bg));
    setEffectSwatches(makeEffectSwatches(style, fg, bg));
  }, [style, fg, bg]);

  // The base preview reflects style + geometry + effect + colors + intensity + aspect.
  useEffect(() => {
    setBasePreview(makeBasePreview(style, geometry, effect, fg, bg, intensity, aspect));
  }, [style, geometry, effect, fg, bg, intensity, aspect]);

  // When any visual setting changes after a generation, dirty the view so the
  // featured area switches to the live base preview. (The effect also fires on
  // mount, but samples is empty then, so the if-check is a no-op.)
  const hasSamplesNow = samples.length > 0;
  useEffect(() => {
    if (hasSamplesNow) setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, geometry, effect, fg, bg, intensity, aspect]);

  // Auto-dismiss the fallback toast after 5s (re-armed whenever a new one shows).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const n = Math.max(2, Math.min(4, variations || 3));

  type FallbackData = { mode?: string; message?: string; tone?: "warn" | "info" } | null;
  function showToast(message: string, tone: "warn" | "info") {
    setToast({ message, tone, id: Date.now() });
  }
  // Surface the reason a batch fell back — prefer a real failure over the
  // expected "not configured" notice when both are present.
  function notifyFallback(responses: FallbackData[]) {
    const fb =
      responses.find((d) => d?.mode === "fallback" && d.tone === "warn" && d.message) ||
      responses.find((d) => d?.mode === "fallback" && d.message);
    if (fb?.message) showToast(fb.message, fb.tone === "warn" ? "warn" : "info");
  }

  function commit(batch: string[]) {
    const label =
      (heading.trim() || feeling.trim() || "Untitled") +
      ` · ${STYLE_LABELS[style]} · ${GEOMETRY_LABELS[geometry]} · ${EFFECT_LABELS[effect]}`;
    const hist: HistoryItem[] = batch.map((url) => ({ url, label }));
    setSamples(batch);
    setFeaturedUrl(batch[0] ?? null);
    setHistory((prev) => [...hist, ...prev].slice(0, HISTORY_LIMIT));
    setGenerating(false);
    setDirty(false);
  }

  async function run() {
    if (generating) return;
    setGenerating(true);
    const nonce = Math.floor(Math.random() * 1e9);
    try {
      // One request per variation — keeps each response small (Vercel caps
      // serverless function responses at ~4.5 MB) and lets the calls run in
      // parallel. Each returns a single model image (or null on failure).
      const responses: FallbackData[] = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              style,
              geometry,
              effect,
              fg,
              bg,
              intensity,
              aspect,
              feeling,
              heading,
              variations: 1,
              nonce: nonce + i,
            }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        ),
      );
      const modelImages = responses
        .map((d) =>
          d?.mode === "model" && (d as { images?: string[] }).images?.[0]
            ? ((d as { images: string[] }).images[0] as string)
            : null,
        )
        .filter((u): u is string => Boolean(u));

      if (modelImages.length > 0) {
        // Real MAI-Image-2.5 output — stamp client-side for a consistent watermark.
        const stamped = await Promise.all(modelImages.map((u) => watermarkDataUrl(u, fg, aspect)));
        commit(stamped);
        return;
      }
      // No model output — say why, then render procedurally (shimmer stays briefly).
      notifyFallback(responses);
      await new Promise((r) => setTimeout(r, 680));
      commit(generateSamples(style, geometry, effect, fg, bg, intensity, feeling, heading, n, nonce, aspect));
    } catch {
      showToast("Couldn’t reach the model — please try again.", "warn");
      await new Promise((r) => setTimeout(r, 680));
      commit(generateSamples(style, geometry, effect, fg, bg, intensity, feeling, heading, n, nonce, aspect));
    }
  }

  function selectSample(i: number) {
    setFeaturedUrl(samples[i]);
    setDirty(false);
  }
  function loadHistory(i: number) {
    const h = history[i];
    if (h) {
      setSamples([h.url]);
      setFeaturedUrl(h.url);
      setDirty(false);
    }
  }

  function commitEdit(url: string, instruction: string) {
    const label = `Edit · ${instruction}`.slice(0, 56);
    // Surface the result as the featured image, add it to the sample row, and
    // record it in history. The option-bar selectors are untouched (the edit
    // deliberately ignored them).
    setSamples((prev) => [url, ...prev].slice(0, 6));
    setFeaturedUrl(url);
    setHistory((prev) => [{ url, label }, ...prev].slice(0, HISTORY_LIMIT));
    setEditPrompt("");
    setEditing(false);
    setDirty(false);
  }

  async function applyEdit() {
    const instruction = editPrompt.trim();
    if (!instruction || editing || !featuredImg) return;
    setEditing(true);
    const nonce = Math.floor(Math.random() * 1e9);
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: featuredImg, instruction, aspect }),
      });
      const data: FallbackData & { image?: string } = res.ok ? await res.json() : null;
      if (data?.mode === "model" && data.image) {
        const stamped = await watermarkDataUrl(data.image as string, fg, aspect);
        commitEdit(stamped, instruction);
        return;
      }
      // No edit model — say why, then procedural best-effort (shimmer stays briefly).
      if (data?.mode === "fallback" && data.message) {
        showToast(data.message, data.tone === "warn" ? "warn" : "info");
      } else if (!data) {
        showToast("Couldn’t reach the model — please try again.", "warn");
      }
      await new Promise((r) => setTimeout(r, 520));
      commitEdit(generateEditFallback(instruction, fg, bg, intensity, nonce, aspect), instruction);
    } catch {
      showToast("Couldn’t reach the model — please try again.", "warn");
      await new Promise((r) => setTimeout(r, 520));
      commitEdit(generateEditFallback(instruction, fg, bg, intensity, nonce, aspect), instruction);
    }
  }

  // ----- derived -----
  const hasSamples = samples.length > 0;
  // While `dirty` (settings changed since the last generation), show the live
  // base preview instead of the generated image, so the picture tracks the
  // current settings.
  const showingPreview = !hasSamples || dirty;
  const featuredImg = showingPreview ? basePreview : featuredUrl || samples[0];
  const styleLabel = STYLE_LABELS[style];
  const geomLabel = GEOMETRY_LABELS[geometry];
  const effectLabel = EFFECT_LABELS[effect];
  const featuredCaption = showingPreview
    ? `Preview · ${styleLabel} · ${geomLabel} · ${effectLabel}`
    : `${styleLabel} · ${geomLabel} · ${effectLabel} · MAI-Image-2.5`;
  const showSamples = hasSamples && !generating;
  const historyCount = String(history.length).padStart(2, "0") + " saved";

  // Featured/shimmer/edit box, sized to the chosen aspect ratio within bounds.
  const ar = ASPECTS.find((a) => a.key === aspect) ?? ASPECTS[0];
  const MAX_W = 420;
  const MAX_H = 520;
  let boxW = MAX_W;
  let boxH = (MAX_W * ar.h) / ar.w;
  if (boxH > MAX_H) {
    boxH = MAX_H;
    boxW = (MAX_H * ar.w) / ar.h;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
        background: "#fbfaf6",
        color: "#161512",
        fontFamily: SANS,
      }}
    >
      {/* ---------- Fallback toast (top-right, auto-dismiss 5s) ---------- */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          onClick={() => setToast(null)}
          title="Dismiss"
          style={{
            position: "fixed",
            top: 18,
            right: 18,
            zIndex: 50,
            maxWidth: 330,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 14px",
            background: "#fff",
            border: "1px solid #ece9e2",
            borderLeft: `3px solid ${toast.tone === "warn" ? "#d23b34" : "#9a968d"}`,
            boxShadow: "0 14px 34px -14px rgba(0,0,0,0.32)",
            font: `400 13px/1.45 ${SANS}`,
            color: "#161512",
            cursor: "pointer",
            animation: "maiToastIn 0.22s ease-out",
          }}
        >
          <span aria-hidden style={{ marginTop: 1, color: toast.tone === "warn" ? "#d23b34" : "#9a968d" }}>
            {toast.tone === "warn" ? "⚠" : "ℹ"}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* ---------- Header ---------- */}
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "0 48px",
          height: 62,
          flex: "none",
          borderBottom: "1px solid #ece9e2",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontFamily: SERIF, fontSize: 23, letterSpacing: "-0.01em" }}>
            MAI<span style={{ color: "#d23b34" }}>·</span>Image
          </span>
          <span
            style={{
              font: `500 11px/1 ${MONO}`,
              letterSpacing: "0.2em",
              color: "#9a968d",
              textTransform: "uppercase",
            }}
          >
            Studio
          </span>
        </div>
        <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: "0.2em", color: "#9a968d" }}>
          MAI-IMAGE-2.5
        </span>
      </header>

      {/* ---------- Main: controls (left) + preview (right) ---------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 56,
          padding: "32px 48px",
          alignItems: "start",
          flex: "none",
        }}
      >
        {/* LEFT — controls column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 56,
              rowGap: 22,
              alignItems: "start",
            }}
          >
            <ThumbPicker
              title="Style"
              items={STYLES}
              swatches={styleSwatches}
              selectedKey={style}
              onSelect={(k) => setStyle(k as Style)}
            />
            <div>
              <div style={sectionLabelStyle}>Background color</div>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", maxWidth: 340 }}>
                {BG_SWATCHES.map((c) => (
                  <button
                    key={c.color}
                    onClick={() => setBg(c.color)}
                    title={c.name}
                    style={{
                      position: "relative",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: "1px solid rgba(0,0,0,0.1)",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      background: c.color,
                    }}
                  >
                    {c.color === bg && (
                      <span
                        style={{
                          position: "absolute",
                          inset: -4,
                          borderRadius: "50%",
                          border: "1.5px solid #161512",
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <ThumbPicker
              title="Geometry"
              items={GEOMETRIES}
              swatches={geomSwatches}
              selectedKey={geometry}
              onSelect={(k) => setGeometry(k as Geometry)}
            />
            <div>
              <div style={sectionLabelStyle}>Foreground color</div>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", maxWidth: 340 }}>
                {FG_SWATCHES.map((c) => (
                  <button
                    key={c.color}
                    onClick={() => setFg(c.color)}
                    title={c.name}
                    style={{
                      position: "relative",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: "1px solid rgba(0,0,0,0.1)",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      background: c.color,
                    }}
                  >
                    {c.color === fg && (
                      <span
                        style={{
                          position: "absolute",
                          inset: -4,
                          borderRadius: "50%",
                          border: "1.5px solid #161512",
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <ThumbPicker
              title="Effect"
              items={EFFECTS}
              swatches={effectSwatches}
              selectedKey={effect}
              onSelect={(k) => setEffect(k as Effect)}
            />
            <div>
              <div style={sectionLabelStyle}>Intensity</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  width: 220,
                  paddingTop: 4,
                }}
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(intensity * 100)}
                  onChange={(e) => setIntensity(Number(e.target.value) / 100)}
                  aria-label="Foreground / background gradient intensity"
                  style={{ width: "100%", accentColor: fg, cursor: "pointer" }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    font: `500 10px/1 ${MONO}`,
                    letterSpacing: "0.08em",
                    color: "#b3afa6",
                  }}
                >
                  <span>fg / bg gradient</span>
                  <span>{Math.round(intensity * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Prompt row */}
          <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginTop: 4 }}>
            <input
              type="text"
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !generating) run(); }}
              placeholder="Prompt"
              aria-label="Prompt"
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                border: "1px solid #d8d4cc",
                borderRadius: 8,
                background: "#fff",
                padding: "12px 14px",
                font: `400 15px/1.3 ${SANS}`,
                color: "#161512",
                outline: "none",
              }}
            />
            <button
              className="mai-generate"
              onClick={run}
              disabled={generating}
              style={{
                flex: "none",
                padding: "0 28px",
                border: "none",
                borderRadius: 8,
                color: "#fbfaf6",
                font: `600 12px/1 ${SANS}`,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                cursor: generating ? "default" : "pointer",
              }}
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>

        {/* RIGHT — preview column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {generating || editing ? (
            <div
              style={{
                width: boxW,
                height: boxH,
                background: "linear-gradient(90deg,#f3f1ea 25%,#e9e6df 37%,#f3f1ea 63%)",
                backgroundSize: "200% 100%",
                animation: "maiShimmer 1.3s ease-in-out infinite",
              }}
            />
          ) : (
            <div
              style={{
                position: "relative",
                width: boxW,
                height: boxH,
                boxShadow: "0 1px 0 #ece9e2, 0 26px 60px -34px rgba(0,0,0,0.32)",
              }}
            >
              {featuredImg && (
                <img
                  src={featuredImg}
                  alt=""
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    border: "1px solid #ece9e2",
                  }}
                />
              )}
              {hasSamples && !showingPreview && featuredImg && (
                <a
                  className="mai-download"
                  href={featuredImg}
                  download="MAI-Image-2.5.png"
                  title="Download"
                  style={{
                    position: "absolute",
                    top: 11,
                    right: 11,
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(20,20,20,0.12)",
                    color: "#161512",
                    textDecoration: "none",
                    fontSize: 14,
                  }}
                >
                  ↓
                </a>
              )}
            </div>
          )}

          {/* Aspect ratio thumbnails — below the preview, sized to ratio */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 4 }}>
            {ASPECTS.map(({ key, label, w, h }) => {
              const selected = key === aspect;
              const cap = 38;
              const sw = w >= h ? cap : (cap * w) / h;
              const sh = h >= w ? cap : (cap * h) / w;
              return (
                <button
                  key={key}
                  onClick={() => setAspect(key)}
                  title={label}
                  aria-pressed={selected}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: sw,
                      height: sh,
                      background: selected ? "#161512" : "#fff",
                      border: `1.5px solid ${selected ? "#161512" : "#c4bfb6"}`,
                    }}
                  />
                  <span
                    style={{
                      font: `600 9px/1 ${SANS}`,
                      letterSpacing: "0.06em",
                      color: selected ? "#161512" : "#9a968d",
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              font: `500 10px/1 ${MONO}`,
              letterSpacing: "0.08em",
              color: "#b3afa6",
              marginTop: 2,
            }}
          >
            {featuredCaption}
          </div>

          {showSamples && (
            <div style={{ display: "flex", gap: 11, alignItems: "center", marginTop: 2 }}>
              {samples.map((url, i) => {
                const selected = url === featuredImg;
                return (
                  <button
                    key={i}
                    onClick={() => selectSample(i)}
                    style={{
                      position: "relative",
                      width: 64,
                      height: 64,
                      padding: 0,
                      margin: 0,
                      border: "1px solid #ece9e2",
                      cursor: "pointer",
                      overflow: "hidden",
                      background: "#fff",
                      display: "block",
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {selected && (
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          border: "2px solid #161512",
                          // Inner white halo so the ring stands out on
                          // dark-background sample images too.
                          boxShadow: "inset 0 0 0 1px #ffffff",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </button>
                );
              })}
              <button
                className="mai-refresh"
                onClick={run}
                title="Refresh samples"
                style={{
                  width: 64,
                  height: 64,
                  flex: "none",
                  border: "1px solid #d8d4cc",
                  background: "#fff",
                  color: "#161512",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                ↻
              </button>
            </div>
          )}

          {/* Edit the current image — free-form, ignores the selectors above. */}
          {hasSamples && !generating && (
            <div
              style={{
                width: boxW,
                display: "flex",
                flexDirection: "column",
                gap: 9,
                marginTop: 6,
              }}
            >
              <div style={sectionLabelStyle}>Edit this image</div>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) applyEdit();
                }}
                disabled={editing}
                rows={2}
                placeholder="Describe a change — e.g. “make it darker, more negative space.” Ignores the options above."
                style={{
                  resize: "vertical",
                  border: "1px solid #d8d4cc",
                  borderRadius: 6,
                  background: "transparent",
                  padding: "9px 10px",
                  font: `400 14px/1.4 ${SANS}`,
                  color: "#161512",
                  outline: "none",
                }}
              />
              <button
                onClick={applyEdit}
                disabled={editing || editPrompt.trim().length === 0}
                className="mai-generate"
                style={{
                  alignSelf: "flex-start",
                  padding: "10px 22px",
                  border: "none",
                  borderRadius: 6,
                  color: "#fbfaf6",
                  font: `600 11px/1 ${SANS}`,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  cursor:
                    editing || editPrompt.trim().length === 0 ? "default" : "pointer",
                  opacity: editPrompt.trim().length === 0 ? 0.5 : 1,
                }}
              >
                {editing ? "Editing…" : "Apply edit"}
              </button>
            </div>
          )}
        </div>
      </div>


      {/* ---------- Footer / History ---------- */}
      <footer
        style={{
          flex: "none",
          borderTop: "1px solid #ece9e2",
          padding: "16px 48px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          minHeight: 108,
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: "none", width: 84 }}>
          <div style={{ fontFamily: SERIF, fontSize: 16 }}>History</div>
          <div
            style={{
              font: `500 10px/1 ${MONO}`,
              letterSpacing: "0.1em",
              color: "#c0bcb3",
              marginTop: 5,
            }}
          >
            {historyCount}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {history.length > 0 ? (
            <div
              className="mai-strip"
              style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}
            >
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => loadHistory(i)}
                  title={h.label}
                  style={{
                    flex: "none",
                    width: 74,
                    height: 74,
                    padding: 0,
                    margin: 0,
                    border: "1px solid #ece9e2",
                    cursor: "pointer",
                    overflow: "hidden",
                    background: "#fff",
                    display: "block",
                  }}
                >
                  <img
                    src={h.url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div style={{ font: `400 13px/1.5 ${SANS}`, color: "#cfcabf" }}>
              Generated images will collect here.
            </div>
          )}
        </div>
        {history.length > 0 && (
          <button
            className="mai-clear"
            onClick={() => setHistory([])}
            style={{
              flex: "none",
              padding: "8px 12px",
              border: "none",
              background: "none",
              color: "#9a968d",
              font: `600 10px/1 ${SANS}`,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </footer>
    </div>
  );
}
