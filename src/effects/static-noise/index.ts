import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_amount;
uniform bool u_colored;
uniform float u_speed;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float t = floor(u_time * u_speed * 30.0);
  vec2 seed = v_texCoord + vec2(t);

  if (u_colored) {
    vec3 noise = vec3(
      hash(seed * 1.0),
      hash(seed * 2.0),
      hash(seed * 3.0)
    ) * 2.0 - 1.0;
    color.rgb += noise * u_amount;
  } else {
    float noise = (hash(seed) * 2.0 - 1.0) * u_amount;
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
    { key: 'amount', label: 'Amount', type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, semanticHint: 'How much noise to add (0=none, 1=full)' },
    { key: 'colored', label: 'Colored', type: 'boolean', default: true, semanticHint: 'Color noise vs monochrome grain' },
    { key: 'speed', label: 'Speed', type: 'number', default: 0, min: 0, max: 10, step: 0.1, semanticHint: 'Animation speed (0=frozen noise)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_amount: params.amount as number,
        u_colored: params.colored as boolean,
        u_speed: params.speed as number,
      }
    },
  },
})
