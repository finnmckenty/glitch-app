import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

/**
 * Smart Fill — Bauhaus-inspired pattern generation.
 *
 * Lays out a grid of shapes and applies structured variation via multi-octave
 * noise (FBM). The noise creates organic "lumpy" clusters rather than random
 * scatter, following the dynamics/contrast principle: large areas of change
 * juxtaposed with smaller scattered features.
 *
 * Variation systems:
 *   0 = Opacity  — triangles present/absent in lumpy clusters
 *   1 = Scale    — triangles vary in size with organic clustering
 *   2 = Both     — opacity + scale combined
 *
 * Color variation is an independent toggle layered on top.
 */

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;

// Smart Fill params
uniform int u_shape;
uniform int u_system;       // 0=opacity, 1=scale, 2=both
uniform float u_seed;
uniform float u_fillScale;
uniform float u_intensity;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform float u_colorIntensity;

out vec4 fragColor;

// ─── Hash & Noise ──────────────────────────────────────────────
// Based on common GLSL noise implementations.
// hash21: vec2 → float, deterministic pseudo-random

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Smooth 2D value noise with bicubic interpolation
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smooth Hermite interpolation
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian Motion — 4 octaves with balanced weighting.
// Higher base frequency for smaller, more varied clusters.
// Produces a mix of medium lumps with scattered small features.
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.45;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amp * valueNoise(p * freq);
    freq *= 2.2;
    amp *= 0.45;
  }
  return value / 0.68; // normalize to ~0-1 range
}

// ─── Shape Functions ───────────────────────────────────────────
// All shapes: centered at origin, size is half-extent.
// Returns 1.0 inside shape, 0.0 outside.

float triangleDown(vec2 p, float size) {
  // Downward-pointing triangle ▽
  // Apex at bottom (0, size), base at top (-size, -size) to (size, -size)
  // Flip Y so it points down visually in WebGL coords
  p.y = -p.y;
  float halfBase = size;
  float height = size * 1.5;
  // Triangle bounds: top edge at y = -height/2, apex at y = height/2
  float t = (p.y + height * 0.5) / height; // 0 at top, 1 at apex
  if (t < 0.0 || t > 1.0) return 0.0;
  float width = halfBase * (1.0 - t);
  return step(abs(p.x), width);
}

float shapeAt(vec2 p, float size, int shapeType) {
  if (shapeType == 0) return triangleDown(p, size);
  // Future shapes: circle, X, diamond, etc.
  return triangleDown(p, size); // fallback
}

// ─── Per-cell variation ────────────────────────────────────────
// Two-layer noise system:
//   Layer 1 (lumps): FBM — spatially correlated, creates medium clusters
//                    of ~5-7 removed cells
//   Layer 2 (scatter): per-cell hash — uncorrelated, creates isolated
//                      single-cell removals scattered throughout
// Together they produce the Bauhaus dynamics/contrast feel:
// medium lumpy areas + smaller scattered singles for balance.

float getLumpNoise(vec2 cellId, float seed) {
  // Medium-frequency FBM for organic clusters
  return fbm((cellId + seed) * 0.4);
}

float getScatterNoise(vec2 cellId, float seed) {
  // Per-cell hash — no spatial correlation, purely random per cell
  return hash21(cellId * 7.31 + seed * 0.173);
}

float getCellOpacity(vec2 cellId, float seed, float intensity, int system) {
  if (system == 0 || system == 2) {
    // Binary: triangle is fully visible or fully hidden.

    // Layer 1: Lumps — medium clusters of removed triangles.
    // At intensity 0.5 → lumps remove ~15-20% of cells in clusters of 5-7
    float lumpN = getLumpNoise(cellId, seed);
    float lumpThreshold = mix(0.0, 0.55, intensity);
    bool lumpRemove = lumpN < lumpThreshold;

    // Layer 2: Scatter — isolated single-cell removals.
    // At intensity 0.5 → scatter removes an additional ~8% as singles
    float scatterN = getScatterNoise(cellId, seed);
    float scatterThreshold = mix(0.0, 0.15, intensity);
    bool scatterRemove = scatterN < scatterThreshold;

    // Either layer can remove a triangle
    return (lumpRemove || scatterRemove) ? 0.0 : 1.0;
  }
  return 1.0;
}

float getCellScale(vec2 cellId, float seed, float intensity, int system) {
  if (system == 1 || system == 2) {
    // Use lump noise for scale (spatially correlated)
    float noise = getLumpNoise(cellId, seed);
    // Map noise to scale range. Intensity controls the range width.
    float minScale = mix(1.0, 0.3, intensity);
    float maxScale = mix(1.0, 2.5, intensity);
    return mix(minScale, maxScale, noise);
  }
  return 1.0;
}

vec3 getCellColor(vec2 cellId, float seed, float colorIntensity, vec3 c1, vec3 c2) {
  if (colorIntensity < 0.01) return c1;
  // Per-cell hash for scattered individual accent colors (no clustering)
  // Offset seed so color is decorrelated from opacity scatter
  float colorN = hash21(cellId * 13.17 + seed * 0.291 + 91.0);
  // colorIntensity controls probability: 0 = none, 1 = ~40% accent
  float threshold = 1.0 - colorIntensity * 0.4;
  return colorN > threshold ? c2 : c1;
}

// ─── Main ──────────────────────────────────────────────────────

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec2 px = v_texCoord * u_resolution;

  // Grid coordinates
  float cellSize = u_fillScale;
  vec2 gridPos = px / cellSize;
  vec2 cellId = floor(gridPos);

  // Triangles nearly touching: ~1-2px gap between shapes
  float shapeSize = 0.47; // half-extent relative to cell (~94% fill)

  // ── Neighborhood sampling (3×3) ──
  // For scale variation, shapes can overflow their cell.
  // For each pixel, find the LARGEST covering shape (replace, not overlap).
  float bestShape = 0.0;
  float bestScale = 0.0;
  float bestOpacity = 0.0;
  vec3 bestColor = u_color1;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 neighbor = cellId + vec2(float(dx), float(dy));

      // Per-cell opacity (dual-layer: lumps + scatter)
      float cellOpacity = getCellOpacity(neighbor, u_seed, u_intensity, u_system);

      // Skip invisible cells entirely
      if (cellOpacity < 0.01) continue;

      float cellScale = getCellScale(neighbor, u_seed, u_intensity, u_system);

      // Position relative to neighbor's center
      vec2 rel = gridPos - neighbor - 0.5;

      // Shape test at this cell's scale
      float s = shapeAt(rel, shapeSize * cellScale, u_shape);

      // Largest covering shape wins (replace behavior)
      if (s > 0.0 && cellScale >= bestScale) {
        bestScale = cellScale;
        bestShape = s;
        bestOpacity = cellOpacity;
        bestColor = getCellColor(neighbor, u_seed, u_colorIntensity, u_color1, u_color2);
      }
    }
  }

  // Blend shape over input (opacity is binary 0/1 so this is a hard cut)
  float mask = bestShape * bestOpacity;
  color.rgb = mix(color.rgb, bestColor, mask);
  // Ensure triangles are fully opaque even on transparent backgrounds
  color.a = max(color.a, mask);
  fragColor = color;
}
`

registerEffect({
  id: 'smart-fill',
  name: 'Smart Fill',
  category: 'overlay',
  description: 'Bauhaus-inspired pattern generation with structured variation',
  tags: ['fill', 'pattern', 'bauhaus', 'swiss', 'grid', 'triangle', 'generative', 'designed'],
  execution: 'gpu',
  cost: 'medium',
  paramDefs: [
    { key: 'shape', label: 'Shape', type: 'select', default: 0, options: [
      { value: 0, label: 'Triangle' },
    ], semanticHint: 'Shape used for the fill grid' },
    { key: 'system', label: 'System', type: 'select', default: 0, options: [
      { value: 0, label: 'Opacity' },
      { value: 1, label: 'Scale' },
      { value: 2, label: 'Both' },
    ], semanticHint: 'Which variation system to apply' },
    { key: 'seed', label: 'Seed', type: 'number', default: 0, min: 0, max: 9999, step: 1, randomize: true, semanticHint: 'Pattern seed — each value produces a unique arrangement' },
    { key: 'fillScale', label: 'Scale', type: 'number', default: 24, min: 8, max: 120, step: 1, semanticHint: 'Grid cell size in pixels' },
    { key: 'intensity', label: 'Intensity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, semanticHint: 'Amount of variation (0 = uniform grid, 1 = maximum)' },
    { key: 'color1', label: 'Base Color', type: 'color', default: [0.85, 0.85, 0.85], semanticHint: 'Primary shape color' },
    { key: 'color2', label: 'Accent Color', type: 'color', default: [0.8, 1.0, 0.2], semanticHint: 'Secondary accent color for color variation' },
    { key: 'colorIntensity', label: 'Color Variation', type: 'number', default: 0, min: 0, max: 1, step: 0.01, semanticHint: 'Amount of accent color scattered across shapes (0 = off, 1 = maximum)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_shape: params.shape as number,
        u_system: params.system as number,
        u_seed: params.seed as number,
        u_fillScale: params.fillScale as number,
        u_intensity: params.intensity as number,
        u_color1: params.color1 as number[],
        u_color2: params.color2 as number[],
        u_colorIntensity: params.colorIntensity as number,
      }
    },
  },
})
