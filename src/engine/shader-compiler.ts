let _cachedGl: WebGL2RenderingContext | null = null
const shaderCache = new Map<string, WebGLProgram>()
const uniformTypeCache = new Map<WebGLProgram, Map<string, GLenum>>()

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${log}`)
  }
  return shader
}

export function createProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string
): WebGLProgram {
  // Invalidate cache if GL context changed (e.g., HMR, context switch)
  if (gl !== _cachedGl) {
    shaderCache.clear()
    uniformTypeCache.clear()
    _cachedGl = gl
  }

  const cached = shaderCache.get(fragmentSource)
  if (cached) return cached

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${log}`)
  }

  // Clean up shaders (they're linked, no longer needed separately)
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  shaderCache.set(fragmentSource, program)
  return program
}

/**
 * Create a program with custom vertex + fragment shaders.
 * Cached by concatenated source.
 */
export function createProgramFull(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  if (gl !== _cachedGl) {
    shaderCache.clear()
    uniformTypeCache.clear()
    _cachedGl = gl
  }

  const cacheKey = vertexSource + '\n---\n' + fragmentSource
  const cached = shaderCache.get(cacheKey)
  if (cached) return cached

  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${log}`)
  }

  gl.deleteShader(vs)
  gl.deleteShader(fs)

  shaderCache.set(cacheKey, program)
  return program
}

/**
 * Query and cache uniform types for a program.
 * Uses gl.getActiveUniform to determine GLSL type (FLOAT, INT, etc.)
 */
function getUniformType(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string
): GLenum | null {
  let cache = uniformTypeCache.get(program)
  if (!cache) {
    cache = new Map()
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i)
      if (info) cache.set(info.name, info.type)
    }
    uniformTypeCache.set(program, cache)
  }
  return cache.get(name) ?? null
}

export function setUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  value: number | number[] | boolean
): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc === null) return

  if (typeof value === 'boolean') {
    gl.uniform1i(loc, value ? 1 : 0)
  } else if (typeof value === 'number') {
    // Use uniform type to dispatch correctly — int uniforms need uniform1i
    const type = getUniformType(gl, program, name)
    if (type === gl.INT || type === gl.SAMPLER_2D || type === gl.BOOL) {
      gl.uniform1i(loc, value)
    } else {
      gl.uniform1f(loc, value)
    }
  } else if (Array.isArray(value)) {
    const type = getUniformType(gl, program, name)
    if (type === gl.INT_VEC2) {
      gl.uniform2iv(loc, value)
    } else if (type === gl.INT_VEC3) {
      gl.uniform3iv(loc, value)
    } else if (type === gl.INT_VEC4) {
      gl.uniform4iv(loc, value)
    } else {
      switch (value.length) {
        case 2: gl.uniform2fv(loc, value); break
        case 3: gl.uniform3fv(loc, value); break
        case 4: gl.uniform4fv(loc, value); break
      }
    }
  }
}
