import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_hueShift;
uniform float u_saturation;
uniform float u_brightness;
out vec4 fragColor;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 hsv = rgb2hsv(color.rgb);
  hsv.x = fract(hsv.x + u_hueShift / 360.0);
  hsv.y *= u_saturation;
  hsv.z *= u_brightness;
  fragColor = vec4(hsv2rgb(hsv), color.a);
}
`

registerEffect({
  id: 'hue-shift',
  name: 'Hue Shift',
  category: 'color',
  description: 'Rotate hue, adjust saturation and brightness',
  tags: ['hue', 'saturation', 'color', 'rotate'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'hueShift', label: 'Hue', type: 'number', default: 0, min: -180, max: 180, step: 1, semanticHint: 'Hue rotation in degrees (-180 to 180)' },
    { key: 'saturation', label: 'Saturation', type: 'number', default: 1, min: 0, max: 3, step: 0.01, semanticHint: 'Saturation multiplier (0=grayscale, 1=normal, >1=oversaturated)' },
    { key: 'brightness', label: 'Brightness', type: 'number', default: 1, min: 0, max: 3, step: 0.01, semanticHint: 'Brightness multiplier' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_hueShift: params.hueShift as number,
        u_saturation: params.saturation as number,
        u_brightness: params.brightness as number,
      }
    },
  },
})
