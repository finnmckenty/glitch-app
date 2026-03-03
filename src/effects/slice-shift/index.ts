import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_sliceCount;
uniform float u_maxOffset;
uniform float u_seed;
uniform bool u_vertical;
out vec4 fragColor;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec2 uv = v_texCoord;
  float coord = u_vertical ? uv.x : uv.y;
  float sliceIdx = floor(coord * u_sliceCount);
  float rng = hash(sliceIdx + u_seed + floor(u_time * u_speed * 2.0));
  float offset = (rng * 2.0 - 1.0) * u_maxOffset / u_resolution.x;

  // Only shift some slices (based on another hash)
  float prob = hash(sliceIdx * 7.0 + u_seed);
  if (prob > 0.5) offset = 0.0;

  if (u_vertical) {
    uv.y += offset;
  } else {
    uv.x += offset;
  }

  fragColor = texture(u_texture, uv);
}
`

registerEffect({
  id: 'slice-shift',
  name: 'Slice Shift',
  category: 'distortion',
  description: 'Cut image into strips and displace randomly',
  tags: ['slice', 'shift', 'glitch', 'displacement', 'strip'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'sliceCount', label: 'Slices', type: 'number', default: 20, min: 2, max: 200, step: 1, semanticHint: 'Number of horizontal/vertical strips' },
    { key: 'maxOffset', label: 'Max Offset', type: 'number', default: 40, min: 0, max: 500, step: 1, semanticHint: 'Maximum displacement in pixels' },
    { key: 'seed', label: 'Seed', type: 'number', default: 0, min: 0, max: 100, step: 0.1, semanticHint: 'Random seed (change for different patterns)' },
    { key: 'speed', label: 'Speed', type: 'number', default: 0, min: 0, max: 10, step: 0.1, semanticHint: 'Animation speed (0=static)' },
    { key: 'vertical', label: 'Vertical', type: 'boolean', default: false, semanticHint: 'Slice vertically instead of horizontally' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_sliceCount: params.sliceCount as number,
        u_maxOffset: params.maxOffset as number,
        u_seed: params.seed as number,
        u_speed: params.speed as number,
        u_vertical: params.vertical as boolean,
      }
    },
  },
})
