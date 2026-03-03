import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_rOffset;
uniform vec2 u_gOffset;
uniform vec2 u_bOffset;
out vec4 fragColor;

void main() {
  vec2 pixelSize = 1.0 / u_resolution;
  float r = texture(u_texture, v_texCoord + u_rOffset * pixelSize).r;
  float g = texture(u_texture, v_texCoord + u_gOffset * pixelSize).g;
  float b = texture(u_texture, v_texCoord + u_bOffset * pixelSize).b;
  float a = texture(u_texture, v_texCoord).a;
  fragColor = vec4(r, g, b, a);
}
`

const def: EffectDefinition = {
  id: 'channel-shift',
  name: 'Channel Shift',
  category: 'color',
  description: 'Offset RGB channels independently for chromatic distortion',
  tags: ['rgb', 'shift', 'glitch', 'chromatic'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'rX', label: 'Red X', type: 'number', default: 5, min: -100, max: 100, step: 1, semanticHint: 'Horizontal offset of red channel in pixels' },
    { key: 'rY', label: 'Red Y', type: 'number', default: 0, min: -100, max: 100, step: 1, semanticHint: 'Vertical offset of red channel in pixels' },
    { key: 'gX', label: 'Green X', type: 'number', default: 0, min: -100, max: 100, step: 1, semanticHint: 'Horizontal offset of green channel in pixels' },
    { key: 'gY', label: 'Green Y', type: 'number', default: 0, min: -100, max: 100, step: 1, semanticHint: 'Vertical offset of green channel in pixels' },
    { key: 'bX', label: 'Blue X', type: 'number', default: -5, min: -100, max: 100, step: 1, semanticHint: 'Horizontal offset of blue channel in pixels' },
    { key: 'bY', label: 'Blue Y', type: 'number', default: 0, min: -100, max: 100, step: 1, semanticHint: 'Vertical offset of blue channel in pixels' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_rOffset: [params.rX as number, params.rY as number],
        u_gOffset: [params.gX as number, params.gY as number],
        u_bOffset: [params.bX as number, params.bY as number],
      }
    },
  },
}

registerEffect(def)
