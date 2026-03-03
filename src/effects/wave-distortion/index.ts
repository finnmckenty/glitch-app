import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amplitudeX;
uniform float u_amplitudeY;
uniform float u_frequencyX;
uniform float u_frequencyY;
uniform float u_speed;
uniform int u_waveType;
out vec4 fragColor;

float wave(float x, int type) {
  if (type == 0) return sin(x);          // sine
  if (type == 1) return sign(sin(x));    // square
  if (type == 2) return fract(x / 6.2831853) * 2.0 - 1.0; // sawtooth
  return sin(x) + sin(x * 2.0) * 0.5;   // complex
}

void main() {
  vec2 uv = v_texCoord;
  float t = u_time * u_speed;
  float dx = wave(uv.y * u_frequencyX + t, u_waveType) * u_amplitudeX / u_resolution.x;
  float dy = wave(uv.x * u_frequencyY + t * 0.7, u_waveType) * u_amplitudeY / u_resolution.y;
  fragColor = texture(u_texture, uv + vec2(dx, dy));
}
`

registerEffect({
  id: 'wave-distortion',
  name: 'Wave Distortion',
  category: 'distortion',
  description: 'Sine/square/sawtooth wave-based image warping',
  tags: ['wave', 'warp', 'distortion', 'liquid'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'amplitudeX', label: 'X Amplitude', type: 'number', default: 10, min: 0, max: 200, step: 1, semanticHint: 'Horizontal wave displacement in pixels' },
    { key: 'amplitudeY', label: 'Y Amplitude', type: 'number', default: 5, min: 0, max: 200, step: 1, semanticHint: 'Vertical wave displacement in pixels' },
    { key: 'frequencyX', label: 'X Frequency', type: 'number', default: 10, min: 0.1, max: 100, step: 0.1, semanticHint: 'Horizontal wave frequency (higher=more waves)' },
    { key: 'frequencyY', label: 'Y Frequency', type: 'number', default: 10, min: 0.1, max: 100, step: 0.1, semanticHint: 'Vertical wave frequency' },
    { key: 'speed', label: 'Speed', type: 'number', default: 0, min: 0, max: 10, step: 0.1, semanticHint: 'Animation speed (0=static)' },
    { key: 'waveType', label: 'Wave Type', type: 'select', default: 0, options: [
      { value: 0, label: 'Sine' }, { value: 1, label: 'Square' },
      { value: 2, label: 'Sawtooth' }, { value: 3, label: 'Complex' },
    ], semanticHint: 'Wave shape: sine is smooth, square is blocky, sawtooth is jagged' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_amplitudeX: params.amplitudeX as number,
        u_amplitudeY: params.amplitudeY as number,
        u_frequencyX: params.frequencyX as number,
        u_frequencyY: params.frequencyY as number,
        u_speed: params.speed as number,
        u_waveType: params.waveType as number,
      }
    },
  },
})
