import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_spacing;
uniform float u_thickness;
uniform float u_opacity;
uniform float u_speed;
uniform float u_time;
uniform bool u_vertical;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float coord = u_vertical ? gl_FragCoord.x : gl_FragCoord.y;
  coord += u_time * u_speed;
  float line = mod(coord, u_spacing);
  float mask = step(u_thickness, line);
  // Darken where mask = 0 (on the scanline)
  vec3 result = mix(color.rgb * (1.0 - u_opacity), color.rgb, mask);
  fragColor = vec4(result, color.a);
}
`

const def: EffectDefinition = {
  id: 'scanlines',
  name: 'Scanlines',
  category: 'noise-artifacts',
  description: 'Horizontal or vertical scanline overlay',
  tags: ['crt', 'retro', 'lines', 'tv'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'spacing', label: 'Spacing', type: 'number', default: 4, min: 1, max: 50, step: 1, semanticHint: 'Distance between scanlines in pixels' },
    { key: 'thickness', label: 'Thickness', type: 'number', default: 2, min: 0.5, max: 25, step: 0.5, semanticHint: 'Width of each scanline' },
    { key: 'opacity', label: 'Opacity', type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, semanticHint: 'How dark the scanlines are (0=invisible, 1=black)' },
    { key: 'speed', label: 'Scroll Speed', type: 'number', default: 0, min: -100, max: 100, step: 1, semanticHint: 'Speed of scanline scrolling animation (0=static)' },
    { key: 'vertical', label: 'Vertical', type: 'boolean', default: false, semanticHint: 'If true, scanlines run vertically instead of horizontally' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_spacing: params.spacing as number,
        u_thickness: params.thickness as number,
        u_opacity: params.opacity as number,
        u_speed: params.speed as number,
        u_vertical: params.vertical as boolean,
      }
    },
  },
}

registerEffect(def)
