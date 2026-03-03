import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_tolerance;
uniform float u_feather;
uniform float u_expand;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float dist = distance(color.rgb, u_keyColor);

  // smoothstep creates a soft edge between transparent and opaque
  float mask = smoothstep(u_tolerance - u_feather, u_tolerance + u_feather, dist);

  // Expand/contract the mask
  mask = clamp(mask + u_expand, 0.0, 1.0);

  fragColor = vec4(color.rgb, color.a * mask);
}
`

registerEffect({
  id: 'color-key',
  name: 'Color Key',
  category: 'color',
  description: 'Make a selected color transparent (chroma key)',
  tags: ['key', 'chroma', 'transparent', 'alpha', 'remove', 'background', 'green screen'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    {
      key: 'keyColor',
      label: 'Key Color',
      type: 'color',
      default: [0, 1, 0],
      semanticHint: 'The color to make transparent (default: green)',
    },
    {
      key: 'similarity',
      label: 'Similarity',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      semanticHint: 'How much color difference is keyed out (0=exact match, 1=everything)',
    },
    {
      key: 'softness',
      label: 'Edge Softness',
      type: 'number',
      default: 0.1,
      min: 0,
      max: 0.5,
      step: 0.01,
      semanticHint: 'Softness of the key edge (0=hard, 0.5=very soft)',
    },
    {
      key: 'choke',
      label: 'Choke',
      type: 'number',
      default: 0,
      min: -1,
      max: 1,
      step: 0.01,
      semanticHint: 'Shrink (+) or expand (-) the transparent area',
    },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_keyColor: params.keyColor as number[],
        u_tolerance: params.similarity as number,
        u_feather: params.softness as number,
        u_expand: -(params.choke as number),
      }
    },
  },
})
