import type { ComponentType } from 'react'

export type EffectCategory =
  | 'pixel-manipulation'
  | 'distortion'
  | 'noise-artifacts'
  | 'color'
  | 'overlay'

export type EffectExecutionContext = 'gpu' | 'cpu' | 'hybrid'

export type ParamType = 'number' | 'boolean' | 'select' | 'color' | 'vec2' | 'image'

export interface EffectParamDef {
  key: string
  label: string
  type: ParamType
  default: unknown
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: unknown; label: string }>
  /** Only show this param when another param has one of the listed values */
  showWhen?: { key: string; values: unknown[] }
  /** Auto-randomize this param when effect is first added */
  randomize?: boolean
  /** Hint for LLM prompt interpretation */
  semanticHint?: string
}

export type EffectParams = Record<string, unknown>

export interface RenderContext {
  width: number
  height: number
  time: number
  gl: WebGL2RenderingContext
  inputTexture: WebGLTexture
}

export interface CpuProcessContext {
  width: number
  height: number
  originalImageData?: ImageData
}

export interface GpuEffectImpl {
  fragmentShader: string
  getUniforms(params: EffectParams, ctx: RenderContext): Record<string, number | number[] | boolean>
}

export interface CpuEffectImpl {
  process(
    imageData: ImageData,
    params: EffectParams,
    ctx: CpuProcessContext
  ): ImageData | Promise<ImageData>
}

export interface EffectControlsProps {
  params: EffectParams
  paramDefs: EffectParamDef[]
  onChange: (key: string, value: unknown) => void
}

export interface EffectDefinition {
  id: string
  name: string
  category: EffectCategory
  description: string
  tags: string[]
  execution: EffectExecutionContext
  paramDefs: EffectParamDef[]
  cost: 'light' | 'medium' | 'heavy'
  gpu?: GpuEffectImpl
  cpu?: CpuEffectImpl
  Controls?: ComponentType<EffectControlsProps>
}

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add' | 'difference'

export interface EffectInstance {
  /** Unique instance id */
  id: string
  /** References EffectDefinition.id */
  effectId: string
  params: EffectParams
  enabled: boolean
  opacity: number
  blendMode: BlendMode
}
