import type { EffectInstance, BlendMode } from '../effects/types'

// ---- Content Types ----

export interface ImageContent {
  type: 'image'
  /** Object URL for the loaded image — used to restore bitmap from cache */
  sourceUrl: string
  meta: { width: number; height: number; name: string }
}

export interface SolidColorContent {
  type: 'solid-color'
  /** RGB 0-1 */
  color: [number, number, number]
}

export interface TextContent {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  /** wdth axis (75-125, where supported) */
  fontWidth?: number
  /** slnt axis (-12 to 0, where supported) */
  fontSlant?: number
  /** CASL axis (0-1, Recursive only) */
  fontCasual?: number
  /** RGB 0-1 */
  color: [number, number, number]
  align: 'left' | 'center' | 'right'
  /** em units */
  letterSpacing: number
  /** line height multiplier */
  lineHeight: number
  textTransform: 'none' | 'uppercase' | 'lowercase'
  strikethrough: boolean
  underline: boolean
  /** Aliased rendering scale factor (0.04–0.25), or undefined/0 for off */
  aliased?: number
}

export interface GradientContent {
  type: 'gradient'
  colorStops: Array<{ offset: number; color: [number, number, number] }>
  /** degrees */
  angle: number
}

export interface PatternContent {
  type: 'pattern'
  patternType: 'noise' | 'checkerboard' | 'stripes' | 'dots'
  params: Record<string, unknown>
}

export interface ShapeContent {
  type: 'shape'
  shape: 'circle' | 'rectangle' | 'triangle'
  /** RGB 0-1 */
  fill: [number, number, number]
  /** RGB 0-1, or null for no stroke */
  stroke: [number, number, number] | null
  strokeWidth: number
  /** Aliased rendering scale factor (0.04–0.25), or undefined/0 for off */
  aliased?: number
}

export interface AIImageContent {
  type: 'ai-image'
  prompt: string
  imageUrl: string | null
  status: 'idle' | 'generating' | 'done' | 'error'
  error?: string
}

export type FrameContent =
  | ImageContent
  | SolidColorContent
  | TextContent
  | GradientContent
  | PatternContent
  | ShapeContent
  | AIImageContent

// ---- Polygon Mask ----

export interface PolygonMask {
  /** Points in normalized coordinates (0-1) within the frame */
  points: Array<{ x: number; y: number }>
  /** If true, the area INSIDE the polygon is transparent */
  inverted: boolean
}

// ---- Frame ----

export interface Frame {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  /** Higher = rendered on top */
  zIndex: number
  content: FrameContent
  effectChain: EffectInstance[]
  locked: boolean
  visible: boolean
  /** Opacity of the frame in composition (0-1) */
  opacity: number
  /** Blend mode for compositing this frame onto lower layers */
  blendMode: BlendMode
  /** Rotation in degrees (clockwise) */
  rotation: number
  /** Optional polygon mask — if set, masks the frame's output */
  mask?: PolygonMask
  /** Background fill color for the frame (RGB 0-1). Rendered behind content. */
  fillColor?: [number, number, number]
  /** Opacity of the background fill (0-1). Independent of frame opacity. */
  fillOpacity?: number
}

// ---- Background ----

export interface BackgroundColor {
  type: 'color'
  /** RGB 0-1 */
  color: [number, number, number]
  /** 0-1 (0 = transparent, 1 = opaque) */
  alpha: number
}

export interface BackgroundImage {
  type: 'image'
  /** Blob URL for the loaded background image */
  sourceUrl: string
  meta: { width: number; height: number; name: string }
  /** 0-1 (0 = transparent, 1 = opaque) */
  alpha: number
}

export type Background = BackgroundColor | BackgroundImage

export const DEFAULT_BACKGROUND: Background = {
  type: 'color',
  color: [0, 0, 0],
  alpha: 1,
}

// ---- Canvas Document ----

export interface CanvasDocument {
  width: number
  height: number
  background: Background
  frames: Frame[]
  globalEffectChain: EffectInstance[]
  grid: GridConfig
}

// ---- Grid ----

export interface GridConfig {
  type: 'none' | 'columns' | 'modular' | 'custom'
  columns: number
  rows: number
  gutterX: number
  gutterY: number
  marginX: number
  marginY: number
  visible: boolean
  snapEnabled: boolean
}

// ---- Defaults ----

export const DEFAULT_GRID: GridConfig = {
  type: 'none',
  columns: 3,
  rows: 3,
  gutterX: 16,
  gutterY: 16,
  marginX: 32,
  marginY: 32,
  visible: false,
  snapEnabled: true,
}

export const DEFAULT_DOCUMENT: CanvasDocument = {
  width: 1080,
  height: 1920,
  background: { ...DEFAULT_BACKGROUND },
  frames: [],
  globalEffectChain: [],
  grid: { ...DEFAULT_GRID },
}
