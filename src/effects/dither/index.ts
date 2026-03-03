import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_levels;
uniform int u_ditherType;
uniform float u_scale;
out vec4 fragColor;

// 8x8 Bayer matrix
float bayer8(vec2 p) {
  int x = int(mod(p.x, 8.0));
  int y = int(mod(p.y, 8.0));
  int index = x + y * 8;
  // Approximation using math instead of lookup
  int a = (x ^ y);
  int b = ((x & 4) >> 1) | ((y & 4) >> 2);
  float val = float((a * 4 + b) % 16) / 16.0;
  // Better Bayer approximation
  float m = 0.0;
  float s = 1.0;
  for (int i = 0; i < 3; i++) {
    int bx = (int(p.x / s) & 1);
    int by = (int(p.y / s) & 1);
    m += float(bx ^ by) * s * s;
    s *= 2.0;
  }
  return m / 64.0;
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec2 pixelCoord = v_texCoord * u_resolution / u_scale;

  float threshold;
  if (u_ditherType == 0) {
    // Ordered Bayer dither
    threshold = bayer8(pixelCoord) - 0.5;
  } else {
    // Random/noise dither
    float n = fract(sin(dot(pixelCoord, vec2(12.9898, 78.233))) * 43758.5453);
    threshold = n - 0.5;
  }

  float n = max(u_levels, 2.0);
  vec3 dithered = floor(color.rgb * n + threshold) / (n - 1.0);
  fragColor = vec4(clamp(dithered, 0.0, 1.0), color.a);
}
`

registerEffect({
  id: 'dither',
  name: 'Dither',
  category: 'pixel-manipulation',
  description: 'Ordered/random dithering with palette reduction',
  tags: ['dither', 'bayer', 'retro', 'pixel', 'ordered'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'levels', label: 'Levels', type: 'number', default: 4, min: 2, max: 16, step: 1, semanticHint: 'Color levels per channel (fewer=more dithering)' },
    { key: 'ditherType', label: 'Type', type: 'select', default: 0, options: [
      { value: 0, label: 'Ordered (Bayer)' }, { value: 1, label: 'Noise' },
    ], semanticHint: 'Dithering algorithm: ordered gives grid patterns, noise is random' },
    { key: 'scale', label: 'Scale', type: 'number', default: 1, min: 1, max: 10, step: 1, semanticHint: 'Scale up the dither pattern (larger=chunkier dither dots)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_levels: params.levels as number,
        u_ditherType: params.ditherType as number,
        u_scale: params.scale as number,
      }
    },
  },
})
