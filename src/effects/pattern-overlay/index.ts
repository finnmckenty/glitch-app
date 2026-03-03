import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, RenderContext } from '../types'

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
out vec4 fragColor;

float checkerboard(vec2 p) {
  return mod(floor(p.x) + floor(p.y), 2.0);
}

float grid(vec2 p, float lineWidth) {
  vec2 g = abs(fract(p) - 0.5);
  return step(0.5 - lineWidth, max(g.x, g.y));
}

float halftone(vec2 p) {
  vec2 center = floor(p) + 0.5;
  float dist = length(p - center);
  return step(dist, 0.4);
}

float diagonal(vec2 p, float width) {
  return step(fract(p.x + p.y), width);
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
  else if (u_patternType == 1) pattern = grid(uv, 0.05);
  else if (u_patternType == 2) pattern = halftone(uv);
  else if (u_patternType == 3) pattern = diagonal(uv, 0.3);

  color.rgb = mix(color.rgb, vec3(pattern), u_opacity);
  fragColor = color;
}
`

registerEffect({
  id: 'pattern-overlay',
  name: 'Pattern Overlay',
  category: 'overlay',
  description: 'Generated grids, checkerboards, halftone dots',
  tags: ['pattern', 'grid', 'checkerboard', 'halftone', 'dots'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'patternType', label: 'Pattern', type: 'select', default: 0, options: [
      { value: 0, label: 'Checkerboard' }, { value: 1, label: 'Grid' },
      { value: 2, label: 'Halftone' }, { value: 3, label: 'Diagonal' },
    ], semanticHint: 'Type of pattern to overlay' },
    { key: 'scale', label: 'Scale', type: 'number', default: 20, min: 2, max: 200, step: 1, semanticHint: 'Size of pattern cells in pixels' },
    { key: 'opacity', label: 'Opacity', type: 'number', default: 0.2, min: 0, max: 1, step: 0.01, semanticHint: 'How visible the pattern is' },
    { key: 'rotation', label: 'Rotation', type: 'number', default: 0, min: -3.14, max: 3.14, step: 0.01, semanticHint: 'Pattern rotation in radians' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_patternType: params.patternType as number,
        u_scale: params.scale as number,
        u_opacity: params.opacity as number,
        u_rotation: params.rotation as number,
      }
    },
  },
})
