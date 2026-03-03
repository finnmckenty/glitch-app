import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_colorDark;
uniform vec3 u_colorMid;
uniform vec3 u_colorLight;
uniform float u_mix;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  vec3 mapped;
  if (luma < 0.5) {
    mapped = mix(u_colorDark, u_colorMid, luma * 2.0);
  } else {
    mapped = mix(u_colorMid, u_colorLight, (luma - 0.5) * 2.0);
  }

  fragColor = vec4(mix(color.rgb, mapped, u_mix), color.a);
}
`

registerEffect({
  id: 'gradient-map',
  name: 'Gradient Map',
  category: 'color',
  description: 'Map brightness to a 3-color gradient',
  tags: ['gradient', 'duotone', 'color', 'mood'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'colorDark', label: 'Dark', type: 'color', default: [0.0, 0.0, 0.2], semanticHint: 'Color for shadows/dark areas' },
    { key: 'colorMid', label: 'Mid', type: 'color', default: [0.8, 0.0, 0.5], semanticHint: 'Color for midtones' },
    { key: 'colorLight', label: 'Light', type: 'color', default: [1.0, 0.9, 0.3], semanticHint: 'Color for highlights/bright areas' },
    { key: 'mix', label: 'Mix', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Blend between original and gradient-mapped (0=original, 1=fully mapped)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_colorDark: params.colorDark as number[],
        u_colorMid: params.colorMid as number[],
        u_colorLight: params.colorLight as number[],
        u_mix: params.mix as number,
      }
    },
  },
})
