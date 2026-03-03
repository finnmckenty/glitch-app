import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
uniform float u_mix;
uniform bool u_invert;
out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 px = 1.0 / u_resolution;
  // Sobel operator
  float tl = luma(texture(u_texture, v_texCoord + vec2(-px.x, px.y)).rgb);
  float t  = luma(texture(u_texture, v_texCoord + vec2(0.0, px.y)).rgb);
  float tr = luma(texture(u_texture, v_texCoord + vec2(px.x, px.y)).rgb);
  float l  = luma(texture(u_texture, v_texCoord + vec2(-px.x, 0.0)).rgb);
  float r  = luma(texture(u_texture, v_texCoord + vec2(px.x, 0.0)).rgb);
  float bl = luma(texture(u_texture, v_texCoord + vec2(-px.x, -px.y)).rgb);
  float b  = luma(texture(u_texture, v_texCoord + vec2(0.0, -px.y)).rgb);
  float br = luma(texture(u_texture, v_texCoord + vec2(px.x, -px.y)).rgb);

  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float edge = sqrt(gx*gx + gy*gy) * u_strength;
  if (u_invert) edge = 1.0 - edge;

  vec4 original = texture(u_texture, v_texCoord);
  vec3 edgeColor = vec3(edge);
  fragColor = vec4(mix(original.rgb, edgeColor, u_mix), original.a);
}
`

registerEffect({
  id: 'edge-detection',
  name: 'Edge Detection',
  category: 'pixel-manipulation',
  description: 'Sobel edge detection for line-art effects',
  tags: ['edge', 'outline', 'sobel', 'sketch', 'lines'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'strength', label: 'Strength', type: 'number', default: 2, min: 0.1, max: 10, step: 0.1, semanticHint: 'Edge detection sensitivity (higher=more edges)' },
    { key: 'mix', label: 'Mix', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Blend between original and edge-detected (0=original, 1=edges only)' },
    { key: 'invert', label: 'Invert', type: 'boolean', default: false, semanticHint: 'Invert edges (dark lines on white vs white lines on dark)' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_strength: params.strength as number,
        u_mix: params.mix as number,
        u_invert: params.invert as boolean,
      }
    },
  },
})
