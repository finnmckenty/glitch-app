import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_strength;
uniform bool u_radial;
out vec4 fragColor;

void main() {
  vec2 uv = v_texCoord;
  vec2 dir;
  if (u_radial) {
    dir = normalize(uv - 0.5) * length(uv - 0.5);
  } else {
    dir = vec2(1.0, 0.0);
  }
  vec2 offset = dir * u_strength * 0.01;
  float r = texture(u_texture, uv + offset).r;
  float g = texture(u_texture, uv).g;
  float b = texture(u_texture, uv - offset).b;
  float a = texture(u_texture, uv).a;
  fragColor = vec4(r, g, b, a);
}
`

registerEffect({
  id: 'chromatic-aberration',
  name: 'Chromatic Aberration',
  category: 'color',
  description: 'Color fringing from center or edges',
  tags: ['chromatic', 'fringe', 'lens', 'aberration'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'strength', label: 'Strength', type: 'number', default: 3, min: 0, max: 30, step: 0.1, semanticHint: 'Intensity of color fringing (higher=more separation)' },
    { key: 'radial', label: 'Radial', type: 'boolean', default: true, semanticHint: 'If true, aberration radiates from center; if false, horizontal only' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_strength: params.strength as number,
        u_radial: params.radial as boolean,
      }
    },
  },
})
