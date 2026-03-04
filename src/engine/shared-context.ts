export interface PingPongBuffers {
  framebuffers: [WebGLFramebuffer, WebGLFramebuffer]
  textures: [WebGLTexture, WebGLTexture]
  width: number
  height: number
  current: 0 | 1
}

export interface FBO {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

/**
 * Manages the shared WebGL2 context on the visible canvas.
 * All GPU rendering goes through this single context.
 */
export class SharedContext {
  readonly gl: WebGL2RenderingContext
  readonly quadVAO: WebGLVertexArrayObject
  readonly canvas: HTMLCanvasElement
  private _disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    })
    if (!gl) throw new Error('WebGL2 not supported')
    this.gl = gl
    this.quadVAO = this.initQuad()

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      console.warn('WebGL context lost')
    })
    canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored')
    })
  }

  private initQuad(): WebGLVertexArrayObject {
    const { gl } = this
    const data = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ])
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8)
    gl.bindVertexArray(null)
    return vao
  }

  createTexture(width: number, height: number): WebGLTexture {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  uploadToTexture(
    source: ImageBitmap | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas,
    existing?: WebGLTexture,
    nearest?: boolean
  ): WebGLTexture {
    const { gl } = this
    const tex = existing ?? gl.createTexture()!
    const filter = nearest ? gl.NEAREST : gl.LINEAR
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  deleteTexture(tex: WebGLTexture): void {
    this.gl.deleteTexture(tex)
  }

  allocatePingPong(width: number, height: number): PingPongBuffers {
    const { gl } = this
    const framebuffers: [WebGLFramebuffer, WebGLFramebuffer] = [
      gl.createFramebuffer()!,
      gl.createFramebuffer()!,
    ]
    const textures: [WebGLTexture, WebGLTexture] = [
      this.createTexture(width, height),
      this.createTexture(width, height),
    ]
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[i])
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[i], 0)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { framebuffers, textures, width, height, current: 0 }
  }

  releasePingPong(pp: PingPongBuffers): void {
    const { gl } = this
    for (const fb of pp.framebuffers) gl.deleteFramebuffer(fb)
    for (const tex of pp.textures) gl.deleteTexture(tex)
  }

  createFBO(width: number, height: number): FBO {
    const { gl } = this
    const framebuffer = gl.createFramebuffer()!
    const texture = this.createTexture(width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { framebuffer, texture, width, height }
  }

  releaseFBO(fbo: FBO): void {
    const { gl } = this
    gl.deleteFramebuffer(fbo.framebuffer)
    gl.deleteTexture(fbo.texture)
  }

  drawQuad(): void {
    const { gl } = this
    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
  }
}
