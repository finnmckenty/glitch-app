import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_vignetteStrength;
uniform float u_bloomStrength;
uniform float u_rgbSplit;
out vec4 fragColor;

vec2 curveUV(vec2 uv, float k) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(k, k);
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;
  return uv;
}

void main() {
  vec2 uv = v_texCoord;

  // Barrel distortion
  if (u_curvature > 0.0) {
    uv = curveUV(uv, max(u_curvature, 0.5));
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  // RGB phosphor split
  float r = texture(u_texture, uv + vec2(u_rgbSplit / u_resolution.x, 0.0)).r;
  float g = texture(u_texture, uv).g;
  float b = texture(u_texture, uv - vec2(u_rgbSplit / u_resolution.x, 0.0)).b;
  vec3 color = vec3(r, g, b);

  // Simple bloom (brighten)
  vec3 bloom = vec3(0.0);
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 off = vec2(float(i), float(j)) * 2.0 / u_resolution;
      bloom += texture(u_texture, uv + off).rgb;
    }
  }
  bloom /= 25.0;
  color += bloom * u_bloomStrength;

  // Scanlines
  float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
  color *= 1.0 - u_scanlineIntensity * (1.0 - scanline);

  // Vignette
  float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
  vignette = clamp(pow(16.0 * vignette, u_vignetteStrength), 0.0, 1.0);
  color *= vignette;

  fragColor = vec4(color, 1.0);
}
`

registerEffect({
  id: 'crt-simulation',
  name: 'CRT Simulation',
  category: 'noise-artifacts',
  description: 'Phosphor grid, barrel distortion, bloom, vignette',
  tags: ['crt', 'retro', 'tv', 'monitor', 'vintage'],
  execution: 'gpu',
  cost: 'medium',
  paramDefs: [
    { key: 'curvature', label: 'Curvature', type: 'number', default: 4, min: 0, max: 20, step: 0.5, semanticHint: 'Barrel distortion amount (0=flat, lower=more curved)' },
    { key: 'scanlineIntensity', label: 'Scanlines', type: 'number', default: 0.2, min: 0, max: 1, step: 0.01, semanticHint: 'Intensity of CRT scanline effect' },
    { key: 'vignetteStrength', label: 'Vignette', type: 'number', default: 0.3, min: 0, max: 2, step: 0.01, semanticHint: 'Edge darkening strength' },
    { key: 'bloomStrength', label: 'Bloom', type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, semanticHint: 'Glow/bloom intensity around bright areas' },
    { key: 'rgbSplit', label: 'RGB Split', type: 'number', default: 1.5, min: 0, max: 10, step: 0.1, semanticHint: 'RGB phosphor separation in pixels' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_curvature: params.curvature as number,
        u_scanlineIntensity: params.scanlineIntensity as number,
        u_vignetteStrength: params.vignetteStrength as number,
        u_bloomStrength: params.bloomStrength as number,
        u_rgbSplit: params.rgbSplit as number,
      }
    },
  },
})
