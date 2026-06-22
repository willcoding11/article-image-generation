"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import {
  type Design,
  DESIGNS,
  DESIGN_LABELS,
  FG_SWATCHES,
  BG_SWATCHES,
  makeSwatches,
  makeBasePreview,
  generateSamples,
  watermarkDataUrl,
} from "@/lib/generators";

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const SANS = "Helvetica, Arial, sans-serif";
const SERIF = "var(--font-newsreader), serif";

type HistoryItem = { url: string; label: string };

export default function Studio({ variations = 3 }: { variations?: number }) {
  const [design, setDesign] = useState<Design>("weave");
  const [fg, setFg] = useState("#d23b34");
  const [bg, setBg] = useState("#f4f1ea");
  const [feeling, setFeeling] = useState("");
  const [heading, setHeading] = useState("");
  const [samples, setSamples] = useState<string[]>([]);
  const [featuredUrl, setFeaturedUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [swatches, setSwatches] = useState<Record<Design, string> | null>(null);
  const [basePreview, setBasePreview] = useState<string | null>(null);

  // Live design thumbnails reflect the current foreground/background colors.
  useEffect(() => {
    setSwatches(makeSwatches(fg, bg));
  }, [fg, bg]);

  // The base preview reflects the selected design + colors (no watermark).
  useEffect(() => {
    setBasePreview(makeBasePreview(design, fg, bg));
  }, [design, fg, bg]);

  const n = Math.max(2, Math.min(4, variations || 3));

  function commit(batch: string[]) {
    const label =
      (heading.trim() || feeling.trim() || "Untitled") + " · " + design;
    const hist: HistoryItem[] = batch.map((url) => ({ url, label }));
    setSamples(batch);
    setFeaturedUrl(batch[0] ?? null);
    setHistory((prev) => [...hist, ...prev].slice(0, 18));
    setGenerating(false);
  }

  async function run() {
    if (generating) return;
    setGenerating(true);
    const nonce = Math.floor(Math.random() * 1e9);
    try {
      // One request per variation — keeps each response small (Vercel caps
      // serverless function responses at ~4.5 MB) and lets the calls run in
      // parallel. Each returns a single model image (or null on failure).
      const requests = Array.from({ length: n }, (_, i) =>
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            design,
            fg,
            bg,
            feeling,
            heading,
            variations: 1,
            nonce: nonce + i,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) =>
            data?.mode === "model" && data.images?.[0] ? (data.images[0] as string) : null,
          )
          .catch(() => null),
      );
      const modelImages = (await Promise.all(requests)).filter(
        (u): u is string => Boolean(u),
      );

      if (modelImages.length > 0) {
        // Real MAI-Image-2.5 output — stamp client-side for a consistent watermark.
        const stamped = await Promise.all(modelImages.map((u) => watermarkDataUrl(u, fg)));
        commit(stamped);
        return;
      }
      // No model output — procedural fallback. Keep the shimmer visible briefly.
      await new Promise((r) => setTimeout(r, 680));
      commit(generateSamples(design, fg, bg, feeling, heading, n, nonce));
    } catch {
      await new Promise((r) => setTimeout(r, 680));
      commit(generateSamples(design, fg, bg, feeling, heading, n, nonce));
    }
  }

  function selectSample(i: number) {
    setFeaturedUrl(samples[i]);
  }
  function loadHistory(i: number) {
    const h = history[i];
    if (h) {
      setSamples([h.url]);
      setFeaturedUrl(h.url);
    }
  }

  // ----- derived -----
  const hasSamples = samples.length > 0;
  const featuredImg = hasSamples ? featuredUrl || samples[0] : basePreview;
  const designLabel = DESIGN_LABELS[design];
  const featuredCaption = hasSamples
    ? `${designLabel} · MAI-Image-2.5`
    : `Base preview · ${designLabel}`;
  const showSamples = hasSamples && !generating;
  const hasFeeling = feeling.trim().length > 0;
  const hasHeading = heading.trim().length > 0;
  const historyCount = String(history.length).padStart(2, "0") + " saved";

  const sectionLabel: React.CSSProperties = {
    font: `600 11px/1 ${SANS}`,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#9a968d",
    marginBottom: 11,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        background: "#fbfaf6",
        color: "#161512",
        fontFamily: SANS,
        overflow: "hidden",
      }}
    >
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

      {/* ---------- Options bar ---------- */}
      <div
        style={{
          flex: "none",
          borderBottom: "1px solid #ece9e2",
          padding: "20px 48px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", gap: 52, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* 01 — Design */}
          <div>
            <div style={sectionLabel}>01 — Design</div>
            <div style={{ display: "flex", gap: 10 }}>
              {DESIGNS.map(({ key, label }) => {
                const selected = key === design;
                const preview = swatches?.[key];
                return (
                  <button
                    key={key}
                    onClick={() => setDesign(key)}
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
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 02 — Foreground */}
          <div>
            <div style={sectionLabel}>02 — Foreground</div>
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

          {/* 03 — Background */}
          <div>
            <div style={sectionLabel}>03 — Background</div>
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
        </div>

        {/* Row B — inputs + generate */}
        <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 240px", minWidth: 200, display: "flex", flexDirection: "column", gap: 9 }}>
            <span
              style={{
                font: `600 11px/1 ${SANS}`,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#9a968d",
              }}
            >
              Feeling / Prompt
            </span>
            <input
              type="text"
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              placeholder="quiet, electric, vast, hopeful…"
              style={{
                border: "none",
                borderBottom: "1px solid #d8d4cc",
                background: "transparent",
                padding: "8px 2px",
                font: `400 15px/1.3 ${SANS}`,
                color: "#161512",
                outline: "none",
              }}
            />
          </label>

          <label style={{ flex: "1 1 240px", minWidth: 200, display: "flex", flexDirection: "column", gap: 9 }}>
            <span
              style={{
                font: `600 11px/1 ${SANS}`,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#9a968d",
              }}
            >
              Article heading
            </span>
            <input
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="The headline this image will sit beside"
              style={{
                border: "none",
                borderBottom: "1px solid #d8d4cc",
                background: "transparent",
                padding: "8px 2px",
                fontFamily: SERIF,
                fontSize: 18,
                lineHeight: 1.3,
                color: "#161512",
                outline: "none",
              }}
            />
          </label>

          <button
            className="mai-generate"
            onClick={run}
            disabled={generating}
            style={{
              flex: "none",
              padding: "14px 34px",
              border: "none",
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

      {/* ---------- Preview region ---------- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "32px 48px",
          display: "flex",
          gap: 56,
          alignItems: "flex-start",
        }}
      >
        {/* Left column */}
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 16 }}>
          {generating ? (
            <div
              style={{
                width: 420,
                maxWidth: "42vw",
                aspectRatio: "1 / 1",
                background: "linear-gradient(90deg,#f3f1ea 25%,#e9e6df 37%,#f3f1ea 63%)",
                backgroundSize: "200% 100%",
                animation: "maiShimmer 1.3s ease-in-out infinite",
              }}
            />
          ) : (
            <div
              style={{
                position: "relative",
                width: 420,
                maxWidth: "42vw",
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
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    border: "1px solid #ece9e2",
                  }}
                />
              )}
              {hasSamples && featuredImg && (
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

          <div
            style={{
              font: `500 10px/1 ${MONO}`,
              letterSpacing: "0.08em",
              color: "#b3afa6",
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
        </div>

        {/* Right column — editorial composition */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          {hasFeeling && (
            <div
              style={{
                font: `600 11px/1.4 ${MONO}`,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#a8a298",
                marginBottom: 20,
              }}
            >
              {feeling}
            </div>
          )}
          <h1
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: "clamp(34px,4.4vw,66px)",
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
              color: hasHeading ? "#161512" : "#d9d4cb",
              textWrap: "balance",
            }}
          >
            {hasHeading ? heading : "Your article heading appears here, beside the image."}
          </h1>
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
