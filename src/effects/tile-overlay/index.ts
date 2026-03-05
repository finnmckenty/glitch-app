import { registerEffect } from '../registry'
import type { EffectParams, RenderContext } from '../types'
import { getOrLoadTileTexture } from './texture-cache'

const fragmentShader = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_tileTexture;
uniform vec2 u_resolution;
uniform float u_time;
uniform bool u_hasTile;
uniform float u_tileScale;
uniform float u_tileSpacing;
uniform float u_tileOffsetX;
uniform float u_tileOffsetY;
uniform float u_tileRotation;
uniform float u_tileOpacity;
out vec4 fragColor;

vec2 rotate2d(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  if (!u_hasTile) {
    fragColor = color;
    return;
  }

  // Pixel coordinates
  vec2 px = v_texCoord * u_resolution;

  // Apply offset
  px -= vec2(u_tileOffsetX, u_tileOffsetY);

  // Apply rotation around center
  vec2 center = u_resolution * 0.5;
  px = rotate2d(px - center, u_tileRotation) + center;

  // Tile cell size including spacing
  float cellSize = u_tileScale * (1.0 + u_tileSpacing);

  // UV within tile grid
  vec2 tileUV = px / cellSize;

  // Fractional position within each cell
  vec2 cellFract = fract(tileUV);

  // Portion of cell occupied by the tile (vs spacing)
  float tilePortion = 1.0 / (1.0 + u_tileSpacing);

  // Check if we're in the tile area or the spacing gap
  if (cellFract.x > tilePortion || cellFract.y > tilePortion) {
    fragColor = color;
    return;
  }

  // Map cell fraction to tile UV [0,1]
  vec2 sampleUV = cellFract / tilePortion;

  vec4 tile = texture(u_tileTexture, sampleUV);

  // Blend tile over input using tile alpha and opacity
  float alpha = tile.a * u_tileOpacity;
  color.rgb = mix(color.rgb, tile.rgb, alpha);
  fragColor = color;
}
`

registerEffect({
  id: 'tile-overlay',
  name: 'Tile Overlay',
  category: 'overlay',
  description: 'Tile a custom image across the frame in a repeating grid',
  tags: ['tile', 'repeat', 'pattern', 'image', 'overlay', 'stamp', 'grid'],
  execution: 'gpu',
  cost: 'light',
  paramDefs: [
    { key: 'tileImage', label: 'Tile Image', type: 'image', default: null, semanticHint: 'Image to tile across the frame' },
    { key: 'tileScale', label: 'Tile Size', type: 'number', default: 100, min: 10, max: 1000, step: 1, semanticHint: 'Size of each tile in pixels' },
    { key: 'tileSpacing', label: 'Spacing', type: 'number', default: 0, min: 0, max: 2, step: 0.01, semanticHint: 'Gap between tiles as a fraction of tile size (0 = no gap)' },
    { key: 'tileOffsetX', label: 'Offset X', type: 'number', default: 0, min: -500, max: 500, step: 1, semanticHint: 'Horizontal offset of tile grid in pixels' },
    { key: 'tileOffsetY', label: 'Offset Y', type: 'number', default: 0, min: -500, max: 500, step: 1, semanticHint: 'Vertical offset of tile grid in pixels' },
    { key: 'tileRotation', label: 'Rotation', type: 'number', default: 0, min: -3.14, max: 3.14, step: 0.01, semanticHint: 'Rotation of tile grid in radians' },
    { key: 'tileOpacity', label: 'Opacity', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Opacity of tiles over the original image' },
  ],
  gpu: {
    fragmentShader,
    getUniforms(params: EffectParams, ctx: RenderContext) {
      const { gl } = ctx
      const dataUrl = (params.tileImage as string) || null
      const tileTex = getOrLoadTileTexture(gl, dataUrl)
      const hasTile = tileTex != null

      if (hasTile) {
        // Bind tile texture to TEXTURE1 (TEXTURE0 is the input frame)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, tileTex)
        // Restore active texture to TEXTURE0 so pipeline state isn't disrupted
        gl.activeTexture(gl.TEXTURE0)
      }

      return {
        u_tileTexture: 1, // texture unit 1
        u_hasTile: hasTile,
        u_tileScale: params.tileScale as number,
        u_tileSpacing: params.tileSpacing as number,
        u_tileOffsetX: params.tileOffsetX as number,
        u_tileOffsetY: params.tileOffsetY as number,
        u_tileRotation: params.tileRotation as number,
        u_tileOpacity: params.tileOpacity as number,
      }
    },
  },
})
