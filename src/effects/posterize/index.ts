import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_levels;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float n = max(u_levels, 2.0);
  vec3 posterized = floor(color.rgb * n) / (n - 1.0);
  fragColor = vec4(posterized, color.a);
}
`

const def: EffectDefinition = {
  id: 'posterize',
  name: 'Posterize',
  category: 'pixel-manipulation',
  description: 'Reduce color depth to N levels per channel',
  tags: ['color', 'reduction', 'retro', 'flat'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'levels', label: 'Levels', type: 'number', default: 4, min: 2, max: 32, step: 1, semanticHint: 'Number of color levels per channel. Lower = more dramatic reduction.' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_levels: params.levels as number,
      }
    },
  },
}

registerEffect(def)
