import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_xOffset;
uniform float u_yOffset;
uniform float u_shift;
uniform float u_curve;
uniform float u_bumpAmount;
uniform float u_bumpFreq;
uniform float u_seed;
uniform float u_bumpVariance;
uniform bool u_wrap;
uniform bool u_flipX;
uniform bool u_flipY;
uniform bool u_showPaths;
out vec4 fragColor;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// Monotonic bump function: sum of randomly-positioned smoothstep humps.
// Each hump is monotonically non-decreasing, so their sum is too.
// Returns [0, ~1] range, monotonically non-decreasing in t.
float cumulativeBump(float t, float freq, float seed) {
  float sum = 0.0;
  for (int i = 0; i < 30; i++) {
    if (float(i) >= freq) break;

    // Distribute bumps across [0,1] with random jitter within each slot
    float slot = float(i) / freq;
    float jitter = hash(float(i) * 13.7 + seed * 3.1) / freq;
    float pos = slot + jitter;

    // Random amplitude per bump [0.3, 1.0] — no tiny invisible bumps
    float amp = 0.3 + hash(float(i) * 7.3 + seed * 11.9) * 0.7;

    // Transition width scales with frequency (higher freq = narrower bumps)
    float width = 0.3 / freq;

    sum += amp * smoothstep(pos - width, pos + width, t);
  }
  return sum / freq;
}

// Find which variable-height step a tY position falls into.
// At variance=0, all steps are equal height. At variance=1, heights vary widely based on seed.
float getStepIndex(float tY, float stepCount, float variance, float seed) {
  if (variance < 0.001 || stepCount < 1.5) {
    return floor(tY * stepCount);
  }
  // Compute total weight for normalization
  float totalW = 0.0;
  for (int i = 0; i < 30; i++) {
    if (float(i) >= stepCount) break;
    float rw = 0.2 + hash(float(i) * 17.3 + seed * 5.7) * 1.6;
    totalW += mix(1.0, rw, variance);
  }
  // Find which step tY falls into
  float cumW = 0.0;
  for (int i = 0; i < 30; i++) {
    if (float(i) >= stepCount) break;
    float rw = 0.2 + hash(float(i) * 17.3 + seed * 5.7) * 1.6;
    cumW += mix(1.0, rw, variance);
    if (tY <= cumW / totalW) {
      return float(i);
    }
  }
  return stepCount - 1.0;
}

// Unified axis offset: returns normalized distance from boundary (0..1),
// or -1.0 if on the non-active side.
float axisT(float pos, float offset, bool flip) {
  if (flip) {
    return pos < offset ? (offset - pos) / max(offset, 0.001) : -1.0;
  } else {
    return pos > offset ? (pos - offset) / max(1.0 - offset, 0.001) : -1.0;
  }
}

void main() {
  vec2 uv = v_texCoord;

  // Y offset creates a boundary: rows on the non-active side are unshifted
  float tY = axisT(uv.y, u_yOffset, u_flipY);

  bool inActiveRegion = tY >= 0.0;

  // Outside active region: no displacement
  if (!inActiveRegion) {
    fragColor = texture(u_texture, uv);

    if (u_showPaths) {
      float yLW = 1.5 / u_resolution.y;
      if (abs(uv.y - u_yOffset) < yLW) {
        fragColor = vec4(0.0, 1.0, 0.3, 1.0);
      }
      float gx = u_flipX ? 1.0 - u_xOffset : u_xOffset;
      float xLW = 1.5 / u_resolution.x;
      if (abs(uv.x - gx) < xLW) {
        fragColor = vec4(0.0, 1.0, 0.3, 1.0);
      }
    }
    return;
  }

  // Quantize into discrete stair-step bands (variable height via bumpVariance)
  float stepCount = u_bumpFreq;
  float stepIndex = getStepIndex(tY, stepCount, u_bumpVariance, u_seed);
  float t = stepIndex / max(stepCount - 1.0, 1.0);

  // Power curve
  float curveVal = pow(t, u_curve);

  // Base shift in UV space
  float baseOffset = curveVal * u_shift / u_resolution.x;

  // Cumulative bump (evaluated at quantized t for stepped pattern)
  float bump = 0.0;
  if (u_bumpAmount > 0.5) {
    float bumpDir = u_shift >= 0.0 ? 1.0 : -1.0;
    bump = cumulativeBump(t, u_bumpFreq, u_seed) * (u_bumpAmount / 100.0) * bumpDir;
  }

  // X offset anchors step 1's edge; curve + bumps shift further from there.
  // Flip X mirrors: shift goes left from (1 - xOffset) instead of right from xOffset.
  float displacement = baseOffset + bump;
  float totalOffset;
  if (u_flipX) {
    totalOffset = -(u_xOffset + displacement);
  } else {
    totalOffset = u_xOffset + displacement;
  }

  vec2 sampleUV = vec2(uv.x - totalOffset, uv.y);

  // Wrap or extend edge pixels to fill empty space created by the shift
  if (u_wrap) {
    sampleUV.x = fract(sampleUV.x);
  } else {
    sampleUV.x = clamp(sampleUV.x, 0.0, 1.0);
  }

  fragColor = texture(u_texture, sampleUV);

  // Debug overlay: stepped lines show per-band displacement
  if (u_showPaths) {
    float tDebug = max(tY, 0.0);
    float dbgStepIdx = getStepIndex(tDebug, u_bumpFreq, u_bumpVariance, u_seed);
    float dbgT = dbgStepIdx / max(u_bumpFreq - 1.0, 1.0);
    float debugCurve = pow(dbgT, u_curve);
    float debugBase = debugCurve * u_shift / u_resolution.x;
    float debugBump = 0.0;
    if (u_bumpAmount > 0.5) {
      float bumpDir = u_shift >= 0.0 ? 1.0 : -1.0;
      debugBump = cumulativeBump(dbgT, u_bumpFreq, u_seed) * (u_bumpAmount / 100.0) * bumpDir;
    }

    float blueLine, redLine;
    if (u_flipX) {
      blueLine = 1.0 - u_xOffset - debugBase;
      redLine = 1.0 - u_xOffset - debugBase - debugBump;
    } else {
      blueLine = u_xOffset + debugBase;
      redLine = u_xOffset + debugBase + debugBump;
    }

    float lineWidth = 2.0 / u_resolution.x;

    if (abs(uv.x - blueLine) < lineWidth) {
      fragColor = vec4(0.0, 0.4, 1.0, 1.0);
    }
    if (abs(uv.x - redLine) < lineWidth) {
      fragColor = vec4(1.0, 0.2, 0.2, 1.0);
    }

    // Green crosshair at origin
    float yLineWidth = 1.5 / u_resolution.y;
    if (abs(uv.y - u_yOffset) < yLineWidth) {
      fragColor = vec4(0.0, 1.0, 0.3, 1.0);
    }
    float greenX = u_flipX ? 1.0 - u_xOffset : u_xOffset;
    float xLW = 1.5 / u_resolution.x;
    if (abs(uv.x - greenX) < xLW) {
      fragColor = vec4(0.0, 1.0, 0.3, 1.0);
    }
  }
}
`

registerEffect({
  id: 'path-shift',
  name: 'Path Shift',
  category: 'distortion',
  description: 'Shift pixels horizontally along a curved path from top to bottom',
  tags: ['path', 'shift', 'skew', 'curve', 'distortion', 'displacement'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'xOffset', label: 'X Offset', type: 'number', default: 0, min: 0, max: 0.9, step: 0.01,
      semanticHint: 'Horizontal position of step 1\'s left edge. All subsequent steps shift further from this point.' },
    { key: 'yOffset', label: 'Y Offset', type: 'number', default: 0, min: 0, max: 0.9, step: 0.01,
      semanticHint: 'Vertical position where shifting begins (0=top of image, 0.9=near bottom) — rows above are unshifted' },
    { key: 'flipX', label: 'Flip X', type: 'boolean', default: false,
      semanticHint: 'Flip shift direction — when off, shift goes right from X offset; when on, shift goes left from (1 - X offset)' },
    { key: 'flipY', label: 'Flip Y', type: 'boolean', default: false,
      semanticHint: 'Flip the active region vertically — when off, shift grows downward from Y offset; when on, shift grows upward' },
    { key: 'shift', label: 'Shift', type: 'number', default: 150, min: -500, max: 500, step: 1,
      semanticHint: 'Maximum horizontal shift in pixels (positive=right, negative=left) — every pixel in a row shifts by the same amount' },
    { key: 'curve', label: 'Curve', type: 'number', default: 2.0, min: 0.2, max: 5.0, step: 0.1,
      semanticHint: 'Shift distribution curve (1=linear skew, 2=smooth acceleration, higher=more shift concentrated at the far end)' },
    { key: 'bumpAmount', label: 'Bump Amount', type: 'number', default: 0, min: 0, max: 100, step: 1,
      semanticHint: 'Bump magnitude as percentage of image width — always additive in the shift direction, never subtracts from the base curve' },
    { key: 'bumpFreq', label: 'Bump Freq', type: 'number', default: 5, min: 1, max: 30, step: 1,
      semanticHint: 'Number of discrete stair-step bands — higher values create more, thinner steps' },
    { key: 'bumpVariance', label: 'Bump Variance', type: 'number', default: 0, min: 0, max: 1, step: 0.01,
      semanticHint: 'Step height variation (0=all steps equal height, 1=huge delta between smallest and largest step). Distribution driven by seed.' },
    { key: 'seed', label: 'Seed', type: 'number', default: 0, min: 0, max: 100, step: 0.1, randomize: true,
      semanticHint: 'Random seed for bump pattern and step variance — change to get different variations' },
    { key: 'wrap', label: 'Wrap', type: 'boolean', default: false,
      semanticHint: 'Wrap shifted pixels around edges (true) or smear edge pixel to fill (false)' },
    { key: 'showPaths', label: 'Show Paths', type: 'boolean', default: true,
      semanticHint: 'Show debug overlay: blue = base curve, red = distorted path, green = origin crosshair' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, _ctx: RenderContext) {
      return {
        u_xOffset: params.xOffset as number,
        u_yOffset: params.yOffset as number,
        u_shift: params.shift as number,
        u_curve: params.curve as number,
        u_bumpAmount: params.bumpAmount as number,
        u_bumpFreq: params.bumpFreq as number,
        u_bumpVariance: params.bumpVariance as number,
        u_seed: params.seed as number,
        u_wrap: params.wrap as boolean,
        u_flipX: params.flipX as boolean,
        u_flipY: params.flipY as boolean,
        u_showPaths: params.showPaths as boolean,
      }
    },
  },
})
