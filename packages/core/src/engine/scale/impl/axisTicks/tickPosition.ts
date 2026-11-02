import { ScaleType } from '../../../../foundation/types/scaleType.js'
import { fromLog, logFormulaForPriceRange, toLog } from '../scale_Y/logFormula.js'

import { calculateTickCount } from './tickCount.js'

export interface TickPosition {
  index: number
  t: number
  y: number
}

export interface CalculateTickPositionsOptions {
  /** 内容区上边界；刻度从该像素开始。 */
  contentTop: number
  /** 内容区下边界；刻度在该像素结束。 */
  contentBottom: number
  isMain?: boolean
  hideEdgeTicks?: boolean
  scaleType?: ScaleType
}

/** 把内容区边界归一成可用的像素跨度。 */
function resolveContentSpan(options: CalculateTickPositionsOptions): {
  start: number
  end: number
  height: number
} {
  const start = Math.max(0, options.contentTop)
  const end = Math.max(start, options.contentBottom)
  return { start, end, height: Math.max(0, end - start) }
}

function calculateTickPositions(options: CalculateTickPositionsOptions): TickPosition[] {
  const { isMain, hideEdgeTicks } = options
  const { start, height: viewH } = resolveContentSpan(options)

  const ticks = calculateTickCount(viewH, isMain)
  const positions: TickPosition[] = []

  for (let i = 0; i < ticks; i++) {
    if (hideEdgeTicks && (i === 0 || i === ticks - 1)) continue

    const t = ticks <= 1 ? 0 : i / (ticks - 1)
    const y = start + t * viewH

    positions.push({ index: i, t, y })
  }

  return positions
}

export interface TickPositionWithValue extends TickPosition {
  value: number
}

export interface CalculateValueTickPositionsOptions extends CalculateTickPositionsOptions {
  valueMin: number
  valueMax: number
  logBase?: number
}

const LOG_EPSILON = 1e-10
const LOG_ROUND_CANDIDATES = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]
const PERCENT_STEP_CANDIDATES = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]

function choosePercentTickStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) return 1

  const exp = Math.floor(Math.log10(roughStep))
  const magnitude = Math.pow(10, exp)
  const normalized = roughStep / magnitude

  for (const candidate of PERCENT_STEP_CANDIDATES) {
    if (candidate >= normalized) {
      return candidate * magnitude
    }
  }

  return 10 * magnitude
}

function roundLogTickValue(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return value
  }

  const exp = Math.floor(Math.log10(value))
  const magnitude = Math.pow(10, exp)
  const normalized = value / magnitude

  let best = LOG_ROUND_CANDIDATES[0]
  let minDiff = Infinity
  for (const candidate of LOG_ROUND_CANDIDATES) {
    const diff = Math.abs(candidate - normalized)
    if (diff < minDiff) {
      minDiff = diff
      best = candidate
    }
  }

  return best * magnitude
}

function generatePixelUniformLogTicks(options: {
  contentTop: number
  contentBottom: number
  valueMin: number
  valueMax: number
  targetCount: number
}): TickPositionWithValue[] {
  const { valueMin, valueMax, targetCount } = options
  const { start: yStart, end: yEnd, height: viewH } = resolveContentSpan(options)

  const effectiveMin = Math.max(valueMin, LOG_EPSILON)
  const effectiveMax = Math.max(valueMax, effectiveMin * 1.001)

  if (viewH <= 0) {
    return []
  }

  const formula = logFormulaForPriceRange({ minPrice: effectiveMin, maxPrice: effectiveMax })
  const logMin = toLog(effectiveMin, formula)
  const logMax = toLog(effectiveMax, formula)
  const logRange = logMax - logMin

  if (!Number.isFinite(logRange) || Math.abs(logRange) < 1e-10) {
    return []
  }

  const total = Math.max(2, targetCount)
  const spacingPx = total <= 1 ? viewH : viewH / (total - 1)
  const minSpacingPx = spacingPx * 0.6
  const maxRoundShiftPx = spacingPx * 0.15

  const positions: TickPositionWithValue[] = []
  let prevY: number | null = null

  for (let i = 0; i < total; i++) {
    const idealT = total <= 1 ? 0 : i / (total - 1)
    const idealY = yStart + idealT * viewH
    const logical = logMax - idealT * logRange
    const rawValue = fromLog(logical, formula)

    let value = rawValue
    let t = idealT
    let y = idealY

    const roundedValue = roundLogTickValue(rawValue)
    if (Number.isFinite(roundedValue) && roundedValue > 0) {
      const roundedLogical = toLog(roundedValue, formula)
      const roundedT = (logMax - roundedLogical) / logRange
      const roundedY = yStart + roundedT * viewH

      if (Number.isFinite(roundedY) && Math.abs(roundedY - idealY) <= maxRoundShiftPx) {
        value = roundedValue
        t = roundedT
        y = roundedY
      }
    }

    if (y < yStart - 0.5 || y > yEnd + 0.5) {
      continue
    }

    if (prevY !== null && Math.abs(y - prevY) < minSpacingPx) {
      continue
    }

    positions.push({ index: positions.length, t, y, value })
    prevY = y
  }

  return positions
}

function generatePixelUniformPercentTicks(options: {
  contentTop: number
  contentBottom: number
  valueMin: number
  valueMax: number
  targetCount: number
}): TickPositionWithValue[] {
  const { valueMin, valueMax, targetCount } = options
  const { start: yStart, height: viewH } = resolveContentSpan(options)

  if (viewH <= 0) return []

  const pctRange = valueMax - valueMin
  if (!Number.isFinite(pctRange) || pctRange <= 0) return []

  const total = Math.max(2, targetCount)
  const step = choosePercentTickStep(pctRange / Math.max(1, total - 1))
  const firstIndex = Math.floor(valueMin / step) - 1
  const lastIndex = Math.ceil(valueMax / step) + 1
  const positions: TickPositionWithValue[] = []

  for (let i = lastIndex; i >= firstIndex; i--) {
    const value = i * step
    const normalizedValue = Math.abs(value) < step * 1e-10 ? 0 : value
    const t = (valueMax - normalizedValue) / pctRange
    const y = yStart + t * viewH

    positions.push({ index: positions.length, t, y, value: normalizedValue })
  }

  return positions
}

//
// calculateValueTickPositions 缓存
let _cvtpCacheKey = ''
let _cvtpCacheResult: TickPositionWithValue[] = []

function buildCvtpCacheKey(options: CalculateValueTickPositionsOptions): string {
  return `${options.valueMin}:${options.valueMax}:${options.contentTop}:${options.contentBottom}:${options.isMain}:${options.scaleType ?? ScaleType.Linear}:${options.hideEdgeTicks ?? false}`
}

export function calculateValueTickPositions(
  options: CalculateValueTickPositionsOptions,
): TickPositionWithValue[] {
  // 缓存命中：所有参数相同则直接返回
  const key = buildCvtpCacheKey(options)
  if (key === _cvtpCacheKey) return _cvtpCacheResult

  const { valueMin, valueMax, scaleType = ScaleType.Linear } = options

  if (scaleType === ScaleType.Log) {
    if (valueMin <= 0) {
      // 递归调用走线性路径，线性路径会更新缓存
      return calculateValueTickPositions({ ...options, scaleType: ScaleType.Linear })
    }

    const effectiveMin = Math.max(valueMin, LOG_EPSILON)
    const effectiveMax = Math.max(valueMax, effectiveMin * 1.001)
    const { isMain, hideEdgeTicks } = options
    const contentHeight = resolveContentSpan(options).height
    const targetCount = Math.max(2, calculateTickCount(contentHeight, isMain))

    let positions = generatePixelUniformLogTicks({
      contentTop: options.contentTop,
      contentBottom: options.contentBottom,
      valueMin: effectiveMin,
      valueMax: effectiveMax,
      targetCount,
    })

    if (hideEdgeTicks && positions.length > 2) {
      positions = positions.slice(1, -1)
    }

    const result = positions.map((position, index) => ({ ...position, index }))
    _cvtpCacheKey = key
    _cvtpCacheResult = result
    return result
  }

  if (scaleType === ScaleType.Percent) {
    const { isMain, hideEdgeTicks } = options
    const contentHeight = resolveContentSpan(options).height
    const targetCount = Math.max(2, calculateTickCount(contentHeight, isMain))

    let positions = generatePixelUniformPercentTicks({
      contentTop: options.contentTop,
      contentBottom: options.contentBottom,
      valueMin,
      valueMax,
      targetCount,
    })

    if (hideEdgeTicks && positions.length > 2) {
      positions = positions.slice(1, -1)
    }

    const result = positions.map((position, index) => ({ ...position, index }))
    _cvtpCacheKey = key
    _cvtpCacheResult = result
    return result
  }

  const basePositions = calculateTickPositions(options)
  const totalTicks = calculateTickCount(resolveContentSpan(options).height, options.isMain)
  const valueRange = valueMax - valueMin || 1

  const result = basePositions.map((pos) => {
    const step = valueRange / Math.max(1, totalTicks - 1)
    const value = valueMax - step * pos.index
    return { ...pos, value }
  })
  _cvtpCacheKey = key
  _cvtpCacheResult = result
  return result
}
