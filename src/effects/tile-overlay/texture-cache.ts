/**
 * Singleton texture cache for tile overlay images.
 *
 * Converts data-URL strings (from the `image` param type) into WebGL textures
 * with GL_REPEAT wrapping, cached by data URL. Automatically invalidates when
 * the GL context changes (e.g. HMR, context loss).
 */

interface CachedTile {
  texture: WebGLTexture
  dataUrl: string
}

let _gl: WebGL2RenderingContext | null = null
let _cache: CachedTile | null = null
let _loading: string | null = null

/**
 * Get or create a WebGL texture from a data URL.
 * Returns the texture synchronously if cached, or null while the first load
 * is in progress. The caller should treat null as "no tile yet" and skip
 * tile rendering.
 */
export function getOrLoadTileTexture(
  gl: WebGL2RenderingContext,
  dataUrl: string | null
): WebGLTexture | null {
  if (!dataUrl) return null

  // Context changed — invalidate everything
  if (gl !== _gl) {
    _cache = null
    _loading = null
    _gl = gl
  }

  // Already cached for this URL
  if (_cache && _cache.dataUrl === dataUrl) {
    return _cache.texture
  }

  // Different URL — dispose old texture and start loading new one
  if (_cache) {
    gl.deleteTexture(_cache.texture)
    _cache = null
  }

  // Avoid duplicate loads
  if (_loading === dataUrl) return null
  _loading = dataUrl

  // Async load: decode image → create texture
  const img = new Image()
  img.onload = () => {
    // Guard: context may have changed while loading
    if (gl !== _gl || _loading !== dataUrl) return

    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // Flip Y so the texture is right-side-up in WebGL (Image is top-down, GL is bottom-up)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)

    // REPEAT wrapping for tiling
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    _cache = { texture: tex, dataUrl }
    _loading = null
  }
  img.onerror = () => {
    console.error('[TileCache] Failed to load tile image')
    _loading = null
  }
  img.src = dataUrl

  return null
}

/** Dispose the cached texture. */
export function disposeTileTexture(): void {
  if (_cache && _gl) {
    _gl.deleteTexture(_cache.texture)
  }
  _cache = null
  _loading = null
}
