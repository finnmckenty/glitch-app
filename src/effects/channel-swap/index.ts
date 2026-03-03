import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform int u_rSource;
uniform int u_gSource;
uniform int u_bSource;
out vec4 fragColor;

float getChannel(vec4 c, int ch) {
  if (ch == 0) return c.r;
  if (ch == 1) return c.g;
  if (ch == 2) return c.b;
  return 1.0 - dot(c.rgb, vec3(0.299, 0.587, 0.114)); // inverted luma
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = vec4(
    getChannel(color, u_rSource),
    getChannel(color, u_gSource),
    getChannel(color, u_bSource),
    color.a
  );
}
`

registerEffect({
  id: 'channel-swap',
  name: 'Channel Swap',
  category: 'color',
  description: 'Rearrange or remap RGB channels',
  tags: ['channel', 'swap', 'rgb', 'remap'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'rSource', label: 'Red Source', type: 'select', default: 0, options: [
      { value: 0, label: 'Red' }, { value: 1, label: 'Green' },
      { value: 2, label: 'Blue' }, { value: 3, label: 'Inv. Luma' },
    ], semanticHint: 'Which channel feeds the red output' },
    { key: 'gSource', label: 'Green Source', type: 'select', default: 1, options: [
      { value: 0, label: 'Red' }, { value: 1, label: 'Green' },
      { value: 2, label: 'Blue' }, { value: 3, label: 'Inv. Luma' },
    ], semanticHint: 'Which channel feeds the green output' },
    { key: 'bSource', label: 'Blue Source', type: 'select', default: 2, options: [
      { value: 0, label: 'Red' }, { value: 1, label: 'Green' },
      { value: 2, label: 'Blue' }, { value: 3, label: 'Inv. Luma' },
    ], semanticHint: 'Which channel feeds the blue output' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_rSource: params.rSource as number,
        u_gSource: params.gSource as number,
        u_bSource: params.bSource as number,
      }
    },
  },
})
