import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform int u_waveType;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_angle;
uniform bool u_wave2;
uniform int u_waveType2;
uniform float u_amplitude2;
uniform float u_frequency2;
uniform float u_angle2;
out vec4 fragColor;

float wave(float x, int type) {
  if (type == 0) return sin(x);                                       // sine
  if (type == 1) return sign(sin(x));                                 // square
  if (type == 2) return fract(x / 6.2831853) * 2.0 - 1.0;           // sawtooth
  return abs(mod(x / 3.1415926, 2.0) - 1.0) * 2.0 - 1.0;           // triangle
}

vec2 waveDisplacement(vec2 uv, float freq, float amp, float angleRad, int wType, float t) {
  // Sampling coordinate: varies perpendicular to displacement direction
  float coord = uv.x * sin(angleRad) + uv.y * cos(angleRad);
  float w = wave(coord * freq + t, wType) * amp;
  // Displacement along the wave's push direction
  return vec2(w * cos(angleRad), w * sin(angleRad)) / u_resolution;
}

void main() {
  vec2 uv = v_texCoord;
  float t = u_time * u_speed;
  float a1 = u_angle * 3.1415926 / 180.0;

  vec2 offset = waveDisplacement(uv, u_frequency, u_amplitude, a1, u_waveType, t);

  if (u_wave2) {
    float a2 = u_angle2 * 3.1415926 / 180.0;
    offset += waveDisplacement(uv, u_frequency2, u_amplitude2, a2, u_waveType2, t);
  }

  fragColor = texture(u_texture, uv + offset);
}
`

const waveOptions = [
  { value: 0, label: 'Sine' },
  { value: 1, label: 'Square' },
  { value: 2, label: 'Sawtooth' },
  { value: 3, label: 'Triangle' },
]

registerEffect({
  id: 'wave-distortion',
  name: 'Wave Distortion',
  category: 'distortion',
  description: 'Wave-based image warping with optional dual-wave interference',
  tags: ['wave', 'warp', 'distortion', 'liquid', 'interference', 'moire'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'waveType', label: 'Wave Type', type: 'select', default: 0, options: waveOptions,
      semanticHint: 'Wave shape: sine is smooth, square is blocky, sawtooth is jagged, triangle is linear zigzag' },
    { key: 'amplitude', label: 'Amplitude', type: 'number', default: 10, min: 0, max: 200, step: 1,
      semanticHint: 'Wave displacement in pixels' },
    { key: 'frequency', label: 'Frequency', type: 'number', default: 10, min: 0.1, max: 100, step: 0.1,
      semanticHint: 'Wave frequency (higher=more waves)' },
    { key: 'angle', label: 'Angle', type: 'number', default: 0, min: 0, max: 360, step: 1,
      semanticHint: 'Wave direction in degrees (0=horizontal displacement, 90=vertical)' },
    { key: 'speed', label: 'Speed', type: 'number', default: 0, min: 0, max: 10, step: 0.1,
      semanticHint: 'Animation speed (0=static)' },
    { key: 'wave2', label: 'Wave 2', type: 'boolean', default: true,
      semanticHint: 'Enable second interfering wave for moire/interference patterns' },
    { key: 'waveType2', label: 'Wave 2 Type', type: 'select', default: 0, options: waveOptions,
      showWhen: { key: 'wave2', values: [true] },
      semanticHint: 'Second wave shape' },
    { key: 'amplitude2', label: 'Wave 2 Amplitude', type: 'number', default: 5, min: 0, max: 200, step: 1,
      showWhen: { key: 'wave2', values: [true] },
      semanticHint: 'Second wave displacement in pixels' },
    { key: 'frequency2', label: 'Wave 2 Frequency', type: 'number', default: 10, min: 0.1, max: 100, step: 0.1,
      showWhen: { key: 'wave2', values: [true] },
      semanticHint: 'Second wave frequency' },
    { key: 'angle2', label: 'Wave 2 Angle', type: 'number', default: 90, min: 0, max: 360, step: 1,
      showWhen: { key: 'wave2', values: [true] },
      semanticHint: 'Second wave direction in degrees' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_waveType: params.waveType as number,
        u_amplitude: params.amplitude as number,
        u_frequency: params.frequency as number,
        u_angle: params.angle as number,
        u_speed: params.speed as number,
        u_wave2: params.wave2 as boolean,
        u_waveType2: params.waveType2 as number,
        u_amplitude2: params.amplitude2 as number,
        u_frequency2: params.frequency2 as number,
        u_angle2: params.angle2 as number,
      }
    },
  },
})
