import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amount;
uniform float u_scale;
uniform float u_density;
uniform bool u_colored;
uniform float u_speed;
uniform float u_seed;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float t = floor(u_time * u_speed * 30.0);

  // Quantize UV to create blocky noise at larger scales
  vec2 scaledUV = floor(v_texCoord * u_resolution / u_scale) * u_scale / u_resolution;
  vec2 seed = scaledUV + vec2(t) + vec2(u_seed);

  // Density gate: sparse noise at low values
  float gate = step(1.0 - u_density, hash(scaledUV + vec2(u_seed * 7.7 + t)));

  if (u_colored) {
    vec3 noise = vec3(
      hash(seed * 1.0),
      hash(seed * 2.0),
      hash(seed * 3.0)
    ) * 2.0 - 1.0;
    color.rgb += noise * u_amount * gate;
  } else {
    float noise = (hash(seed) * 2.0 - 1.0) * u_amount * gate;
    color.rgb += noise;
  }

  fragColor = clamp(color, 0.0, 1.0);
}
`

registerEffect({
  id: 'static-noise',
  name: 'Static / Noise',
  category: 'noise-artifacts',
  description: 'Animated random noise overlay',
  tags: ['noise', 'static', 'grain', 'snow', 'tv'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'amount', label: 'Amount', type: 'number', default: 0.15, min: 0, max: 3, step: 0.01,
      semanticHint: 'Noise intensity (0=none, 1=strong, 2-3=extreme blowout)' },
    { key: 'scale', label: 'Scale', type: 'number', default: 1, min: 1, max: 10, step: 0.1,
      semanticHint: 'Grain size in pixels (1=per-pixel, higher=chunky blocks)' },
    { key: 'density', label: 'Density', type: 'number', default: 1.0, min: 0.01, max: 1, step: 0.01,
      semanticHint: 'Probability a pixel gets noise (low=sparse scattered dots, 1=every pixel)' },
    { key: 'colored', label: 'Colored', type: 'boolean', default: true,
      semanticHint: 'Color noise vs monochrome grain' },
    { key: 'speed', label: 'Speed', type: 'number', default: 0, min: 0, max: 10, step: 0.1,
      semanticHint: 'Animation speed (0=frozen noise)' },
    { key: 'seed', label: 'Seed', type: 'number', default: 0, min: 0, max: 100, step: 0.1, randomize: true,
      semanticHint: 'Random seed for noise pattern — change to get different variations' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_amount: params.amount as number,
        u_scale: params.scale as number,
        u_density: params.density as number,
        u_colored: params.colored as boolean,
        u_speed: params.speed as number,
        u_seed: params.seed as number,
      }
    },
  },
})
