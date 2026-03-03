import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_blockSize;
out vec4 fragColor;

void main() {
  vec2 blocks = u_resolution / max(u_blockSize, 1.0);
  vec2 uv = floor(v_texCoord * blocks) / blocks;
  uv += 0.5 / blocks; // sample from block center
  fragColor = texture(u_texture, uv);
}
`

registerEffect({
  id: 'mosaic',
  name: 'Mosaic / Pixelate',
  category: 'pixel-manipulation',
  description: 'Block-based resolution reduction',
  tags: ['pixel', 'blocky', 'mosaic', 'low-res', 'retro'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'blockSize', label: 'Block Size', type: 'number', default: 8, min: 1, max: 100, step: 1, semanticHint: 'Size of each pixel block in pixels (larger=more blocky)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return { u_blockSize: params.blockSize as number }
    },
  },
})
