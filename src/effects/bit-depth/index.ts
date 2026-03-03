import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_bits;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float levels = pow(2.0, u_bits);
  vec3 reduced = floor(color.rgb * levels) / (levels - 1.0);
  fragColor = vec4(reduced, color.a);
}
`

registerEffect({
  id: 'bit-depth',
  name: 'Bit Depth Reduction',
  category: 'pixel-manipulation',
  description: 'Simulate lower bit depth displays (1-bit, 4-bit, 8-bit)',
  tags: ['retro', 'bit', 'reduction', 'vintage', 'gameboy'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'bits', label: 'Bits', type: 'number', default: 3, min: 1, max: 8, step: 1, semanticHint: 'Bits per channel (1=2 colors, 8=256 colors per channel)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return { u_bits: params.bits as number }
    },
  },
})
