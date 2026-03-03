import type { GridConfig } from '../../types/canvas'

export interface GridLines {
  verticals: number[]   // x positions in document coords
  horizontals: number[] // y positions in document coords
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type CornerPosition = 'nw' | 'ne' | 'se' | 'sw'

/**
 * Compute grid line positions from a GridConfig.
 */
export function computeGridLines(
  grid: GridConfig,
  docWidth: number,
  docHeight: number
): GridLines {
  const verticals: number[] = []
  const horizontals: number[] = []

  if (grid.type === 'none') return { verticals, horizontals }

  const { columns, rows, gutterX, gutterY, marginX, marginY } = grid

  // Vertical lines (column boundaries)
  if (columns > 0) {
    const availW = docWidth - 2 * marginX - (columns - 1) * gutterX
    const colW = availW / columns

    // Left margin
    verticals.push(marginX)

    for (let i = 1; i < columns; i++) {
      // Right edge of column i-1
      const rightEdge = marginX + i * colW + (i - 1) * gutterX
      verticals.push(rightEdge)
      // Left edge of column i (after gutter)
      verticals.push(rightEdge + gutterX)
    }

    // Right margin
    verticals.push(docWidth - marginX)
  }

  // Horizontal lines (row boundaries) — only for modular grids
  if (grid.type === 'modular' && rows > 0) {
    const availH = docHeight - 2 * marginY - (rows - 1) * gutterY
    const rowH = availH / rows

    horizontals.push(marginY)

    for (let i = 1; i < rows; i++) {
      const bottomEdge = marginY + i * rowH + (i - 1) * gutterY
      horizontals.push(bottomEdge)
      horizontals.push(bottomEdge + gutterY)
    }

    horizontals.push(docHeight - marginY)
  } else {
    // For 'columns' type, just add margin lines
    horizontals.push(marginY)
    horizontals.push(docHeight - marginY)
  }

  return { verticals, horizontals }
}

/**
 * Find the closest snap value for a single coordinate.
 * Returns the snapped value or the original if nothing is within threshold.
 */
function snapSingle(
  value: number,
  lines: number[],
  threshold: number
): { snapped: number; delta: number } {
  let bestDelta = Infinity
  let bestSnapped = value

  for (const line of lines) {
    const delta = Math.abs(value - line)
    if (delta < bestDelta && delta <= threshold) {
      bestDelta = delta
      bestSnapped = line
    }
  }

  return { snapped: bestSnapped, delta: bestDelta }
}

/**
 * Snap a frame's position during a move operation.
 * Checks left edge, right edge, and center against grid lines.
 * Edge snaps take priority over center snaps.
 */
export function snapPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  gridLines: GridLines,
  threshold: number = 8
): { x: number; y: number } {
  if (gridLines.verticals.length === 0 && gridLines.horizontals.length === 0) {
    return { x, y }
  }

  // Horizontal: snap left, right, or center
  let snapX = x
  const left = snapSingle(x, gridLines.verticals, threshold)
  const right = snapSingle(x + width, gridLines.verticals, threshold)
  const centerX = snapSingle(x + width / 2, gridLines.verticals, threshold)

  // Pick the best (smallest delta), prefer edges over center
  if (left.delta <= right.delta && left.delta <= centerX.delta) {
    if (left.delta <= threshold) snapX = left.snapped
  } else if (right.delta <= left.delta && right.delta <= centerX.delta) {
    if (right.delta <= threshold) snapX = right.snapped - width
  } else {
    if (centerX.delta <= threshold) snapX = centerX.snapped - width / 2
  }

  // Vertical: snap top, bottom, or center
  let snapY = y
  const top = snapSingle(y, gridLines.horizontals, threshold)
  const bottom = snapSingle(y + height, gridLines.horizontals, threshold)
  const centerY = snapSingle(y + height / 2, gridLines.horizontals, threshold)

  if (top.delta <= bottom.delta && top.delta <= centerY.delta) {
    if (top.delta <= threshold) snapY = top.snapped
  } else if (bottom.delta <= top.delta && bottom.delta <= centerY.delta) {
    if (bottom.delta <= threshold) snapY = bottom.snapped - height
  } else {
    if (centerY.delta <= threshold) snapY = centerY.snapped - height / 2
  }

  return { x: snapX, y: snapY }
}

/**
 * Snap a frame's rect during a resize operation.
 * Only the moving edges (determined by handle) snap to grid lines.
 */
export function snapResize(
  rect: Rect,
  handle: HandlePosition,
  gridLines: GridLines,
  threshold: number = 8
): Rect {
  const { x, y, width, height } = rect
  let newX = x, newY = y, newW = width, newH = height

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw'
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se'
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne'
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se'

  if (movesLeft) {
    const snap = snapSingle(x, gridLines.verticals, threshold)
    if (snap.delta <= threshold) {
      const delta = snap.snapped - x
      newX = snap.snapped
      newW = width - delta
    }
  }

  if (movesRight) {
    const snap = snapSingle(x + width, gridLines.verticals, threshold)
    if (snap.delta <= threshold) {
      newW = snap.snapped - newX
    }
  }

  if (movesTop) {
    const snap = snapSingle(y, gridLines.horizontals, threshold)
    if (snap.delta <= threshold) {
      const delta = snap.snapped - y
      newY = snap.snapped
      newH = height - delta
    }
  }

  if (movesBottom) {
    const snap = snapSingle(y + height, gridLines.horizontals, threshold)
    if (snap.delta <= threshold) {
      newH = snap.snapped - newY
    }
  }

  return { x: newX, y: newY, width: newW, height: newH }
}

/**
 * Normalize a rectangle (handle negative width/height from drawing).
 */
export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}
