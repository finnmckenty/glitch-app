import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform int u_axis;       // 0 = horizontal, 1 = vertical
uniform float u_offset;   // 0–1 normalised sample line position
uniform int u_direction;  // 0 = negative (left/up), 1 = positive (right/down)
uniform float u_regionStart;
uniform float u_regionEnd;
uniform float u_jitter;   // pixel amount
uniform float u_fade;     // 0–1
uniform float u_seed;
out vec4 fragColor;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  vec2 uv = v_texCoord;

  // Determine primary axis (smear direction) and cross axis (region check)
  float primary   = u_axis == 0 ? uv.x : uv.y;
  float cross_pos = u_axis == 0 ? uv.y : uv.x;
  float res       = u_axis == 0 ? u_resolution.x : u_resolution.y;

  // Region check on cross axis
  float rStart = min(u_regionStart, u_regionEnd);
  float rEnd   = max(u_regionStart, u_regionEnd);
  if (cross_pos < rStart || cross_pos > rEnd) {
    fragColor = texture(u_texture, uv);
    return;
  }

  // Per-row jitter: quantise cross_pos to pixel rows for consistent jitter per row
  float crossRes  = u_axis == 0 ? u_resolution.y : u_resolution.x;
  float rowIndex  = floor(cross_pos * crossRes);
  float jitterAmt = (hash(rowIndex + u_seed) * 2.0 - 1.0) * u_jitter / res;
  float samplePos = clamp(u_offset + jitterAmt, 0.0, 1.0);

  // Determine if this fragment is on the smeared side
  bool inSmear = u_direction == 0
    ? primary < samplePos   // negative: smear left of / above offset
    : primary > samplePos;  // positive: smear right of / below offset

  if (!inSmear) {
    fragColor = texture(u_texture, uv);
    return;
  }

  // Sample from the offset line
  vec2 sampleUV = u_axis == 0
    ? vec2(samplePos, uv.y)
    : vec2(uv.x, samplePos);
  vec4 smeared = texture(u_texture, sampleUV);

  // Fade: blend smear back to original toward the edge
  // t = 0 at offset line, t = 1 at edge
  // fade=0: hard smear everywhere
  // fade=0.5: solid near offset, fades out toward edge
  // fade=1: smear completely gone (original image shows through)
  float dist = abs(primary - samplePos);
  float maxDist = u_direction == 0 ? samplePos : 1.0 - samplePos;
  float t = maxDist > 0.0 ? dist / maxDist : 0.0;
  // Map fade so that at fade=1, even t=0 (the offset line) blends fully to original
  // fade 0–0.5: controls how much of the tail fades (edge region only)
  // fade 0.5–1: also fades the smear at the source, reaching full transparency at 1
  float edgeBlend = smoothstep(1.0 - min(u_fade * 2.0, 1.0), 1.0, t);
  float sourceBlend = max(u_fade * 2.0 - 1.0, 0.0);
  float blend = max(edgeBlend, sourceBlend);
  vec4 original = texture(u_texture, uv);
  fragColor = mix(smeared, original, blend);
}
`

registerEffect({
  id: 'pixel-smear',
  name: 'Pixel Smear',
  category: 'original',
  description: 'Stretch a column or row of pixels to the edge of the frame',
  tags: ['smear', 'stretch', 'pixel', 'streak', 'glitch'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    {
      key: 'axis', label: 'Axis', type: 'select', default: 'horizontal',
      options: [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }],
      semanticHint: 'Direction of the pixel smear',
    },
    {
      key: 'offset', label: 'Offset', type: 'number', default: 0.5,
      min: 0, max: 1, step: 0.01,
      semanticHint: 'Position of the sample line (0–1)',
    },
    {
      key: 'direction', label: 'Direction', type: 'select', default: 'negative',
      options: [{ value: 'negative', label: 'Negative' }, { value: 'positive', label: 'Positive' }],
      semanticHint: 'Which side of the offset gets smeared',
    },
    {
      key: 'regionStart', label: 'Region Start', type: 'number', default: 0,
      min: 0, max: 1, step: 0.01,
      semanticHint: 'Start of the affected region on the cross axis',
    },
    {
      key: 'regionEnd', label: 'Region End', type: 'number', default: 1,
      min: 0, max: 1, step: 0.01,
      semanticHint: 'End of the affected region on the cross axis',
    },
    {
      key: 'jitter', label: 'Jitter', type: 'number', default: 0,
      min: 0, max: 200, step: 1,
      semanticHint: 'Per-row random variation on the offset position in pixels',
    },
    {
      key: 'fade', label: 'Fade', type: 'number', default: 0,
      min: 0, max: 1, step: 0.01,
      semanticHint: 'Blend smear back to original near the edge (0 = hard smear)',
    },
    {
      key: 'seed', label: 'Seed', type: 'number', default: 42,
      min: 0, max: 9999, step: 1, randomize: true,
      semanticHint: 'Random seed for jitter variation',
    },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_axis: params.axis === 'vertical' ? 1 : 0,
        u_offset: params.offset as number,
        u_direction: params.direction === 'positive' ? 1 : 0,
        u_regionStart: params.regionStart as number,
        u_regionEnd: params.regionEnd as number,
        u_jitter: params.jitter as number,
        u_fade: params.fade as number,
        u_seed: params.seed as number,
      }
    },
  },
})
