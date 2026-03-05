import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_patternType;
uniform float u_scale;
uniform float u_opacity;
uniform float u_rotation;
uniform vec3 u_fgColor;
uniform float u_fgAlpha;
uniform vec3 u_bgColor;
uniform float u_bgAlpha;
uniform float u_lineWidth;
uniform float u_lineSpacing;
uniform float u_dotSize;
out vec4 fragColor;

float checkerboard(vec2 p) {
  return mod(floor(p.x) + floor(p.y), 2.0);
}

float grid(vec2 p, float lineWidth) {
  vec2 g = abs(fract(p) - 0.5);
  return step(0.5 - lineWidth, max(g.x, g.y));
}

float halftone(vec2 p, float dotRadius) {
  vec2 center = floor(p) + 0.5;
  float dist = length(p - center);
  return step(dist, dotRadius);
}

float diagonal(vec2 p, float width, float spacing) {
  return step(fract((p.x + p.y) / spacing), width);
}

float crosshatch(vec2 p, float width) {
  float line1 = step(fract(p.x + p.y), width);
  float line2 = step(fract(p.x - p.y), width);
  return max(line1, line2);
}

float concentricRings(vec2 p) {
  vec2 center = floor(p) + 0.5;
  float dist = length(p - center);
  return step(fract(dist * 3.0), 0.5);
}

float zigzag(vec2 p, float width) {
  float wave = abs(fract(p.x) - 0.5) * 2.0;
  return step(fract(p.y + wave), width);
}

float flames(vec2 p, float time) {
  float n = sin(p.x * 3.0 + time) * cos(p.y * 2.0 - time * 1.3);
  n += sin(p.x * 7.0 - time * 0.7) * 0.5;
  n += cos(p.y * 5.0 + time * 2.0) * 0.3;
  n = abs(n);
  float flicker = step(0.3, fract(n * 2.0 + sin(time * 3.0 + p.y) * 0.3));
  return flicker;
}

vec2 rotate2d(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec2 uv = v_texCoord * u_resolution / u_scale;
  uv = rotate2d(uv - u_resolution * 0.5 / u_scale, u_rotation) + u_resolution * 0.5 / u_scale;

  float pattern = 0.0;
  if (u_patternType == 0) pattern = checkerboard(uv);
  else if (u_patternType == 1) pattern = grid(uv, u_lineWidth);
  else if (u_patternType == 2) pattern = halftone(uv, u_dotSize);
  else if (u_patternType == 3) pattern = diagonal(uv, u_lineWidth, u_lineSpacing);
  else if (u_patternType == 4) pattern = crosshatch(uv, u_lineWidth);
  else if (u_patternType == 5) pattern = concentricRings(uv);
  else if (u_patternType == 6) pattern = zigzag(uv, u_lineWidth);
  else if (u_patternType == 7) pattern = flames(uv, u_time);

  // Blend fg/bg colors based on pattern value, respecting per-color alpha
  vec3 patternColor = mix(u_bgColor, u_fgColor, pattern);
  float patternAlpha = mix(u_bgAlpha, u_fgAlpha, pattern);
  color.rgb = mix(color.rgb, patternColor, patternAlpha * u_opacity);
  fragColor = color;
}
`

// Pattern indices for showWhen conditions
const LINE_PATTERNS = [1, 3, 4, 6]  // Grid, Diagonal, Crosshatch, Zigzag
const DIAGONAL_ONLY = [3]            // Diagonal
const HALFTONE_ONLY = [2]            // Halftone

registerEffect({
  id: 'pattern-overlay',
  name: 'Pattern Overlay',
  category: 'overlay',
  description: 'Generated grids, checkerboards, halftone dots, and more',
  tags: ['pattern', 'grid', 'checkerboard', 'halftone', 'dots', 'crosshatch', 'zigzag', 'flames'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'patternType', label: 'Pattern', type: 'select', default: 0, options: [
      { value: 0, label: 'Checkerboard' }, { value: 1, label: 'Grid' },
      { value: 2, label: 'Halftone' }, { value: 3, label: 'Diagonal' },
      { value: 4, label: 'Crosshatch' }, { value: 5, label: 'Concentric Rings' },
      { value: 6, label: 'Zigzag' }, { value: 7, label: 'Flames 🔥' },
    ], semanticHint: 'Type of pattern to overlay' },
    { key: 'scale', label: 'Scale', type: 'number', default: 20, min: 2, max: 200, step: 1, semanticHint: 'Size of pattern cells in pixels' },
    { key: 'opacity', label: 'Opacity', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Master opacity for the pattern overlay' },
    { key: 'rotation', label: 'Rotation', type: 'number', default: 0, min: -3.14, max: 3.14, step: 0.01, semanticHint: 'Pattern rotation in radians' },
    { key: 'lineWidth', label: 'Line Width', type: 'number', default: 0.3, min: 0.01, max: 0.99, step: 0.01, showWhen: { key: 'patternType', values: LINE_PATTERNS }, semanticHint: 'Thickness of lines (fraction of period)' },
    { key: 'lineSpacing', label: 'Line Spacing', type: 'number', default: 1, min: 0.25, max: 4, step: 0.01, showWhen: { key: 'patternType', values: DIAGONAL_ONLY }, semanticHint: 'Gap between diagonal lines (higher = more space)' },
    { key: 'dotSize', label: 'Dot Size', type: 'number', default: 0.4, min: 0.05, max: 0.5, step: 0.01, showWhen: { key: 'patternType', values: HALFTONE_ONLY }, semanticHint: 'Halftone dot radius relative to cell (larger = dots closer together)' },
    { key: 'fgColor', label: 'FG Color', type: 'color', default: [1, 1, 1], semanticHint: 'Foreground color where pattern is active' },
    { key: 'fgAlpha', label: 'FG Alpha', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Foreground color opacity' },
    { key: 'bgColor', label: 'BG Color', type: 'color', default: [0, 0, 0], semanticHint: 'Background color where pattern is inactive' },
    { key: 'bgAlpha', label: 'BG Alpha', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Background color opacity' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_patternType: params.patternType as number,
        u_scale: params.scale as number,
        u_opacity: params.opacity as number,
        u_rotation: params.rotation as number,
        u_lineWidth: params.lineWidth as number,
        u_lineSpacing: params.lineSpacing as number,
        u_dotSize: params.dotSize as number,
        u_fgColor: params.fgColor as number[],
        u_fgAlpha: params.fgAlpha as number,
        u_bgColor: params.bgColor as number[],
        u_bgAlpha: params.bgAlpha as number,
      }
    },
  },
})
