import { calculateTickCount } from './tickCount'
import { fromLog, logFormulaForPriceRange, toLog } from '../scale/logFormula'

export interface TickPosition {
    index: number
    t: number
    y: number
}

export type ScaleType = 'linear' | 'log' | 'percent'

export interface CalculateTickPositionsOptions {
    height: number
    paddingTop: number
    paddingBottom: number
    isMain?: boolean
    hideEdgeTicks?: boolean
    scaleType?: ScaleType
}

export function calculateTickPositions(
    options: CalculateTickPositionsOptions
): TickPosition[] {
    const { height, paddingTop, paddingBottom, isMain, hideEdgeTicks } = options

    const yStart = paddingTop
    const yEnd = Math.max(paddingTop, height - paddingBottom)
    const viewH = Math.max(0, yEnd - yStart)

    const ticks = calculateTickCount(height, isMain)
    const positions: TickPosition[] = []

    for (let i = 0; i < ticks; i++) {
        if (hideEdgeTicks && (i === 0 || i === ticks - 1)) continue

        const t = ticks <= 1 ? 0 : i / (ticks - 1)
        const y = yStart + t * viewH

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
    height: number
    paddingTop: number
    paddingBottom: number
    valueMin: number
    valueMax: number
    targetCount: number
}): TickPositionWithValue[] {
    const { height, paddingTop, paddingBottom, valueMin, valueMax, targetCount } = options

    const effectiveMin = Math.max(valueMin, LOG_EPSILON)
    const effectiveMax = Math.max(valueMax, effectiveMin * 1.001)
    const yStart = paddingTop
    const yEnd = Math.max(paddingTop, height - paddingBottom)
    const viewH = Math.max(0, yEnd - yStart)

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
    height: number
    paddingTop: number
    paddingBottom: number
    valueMin: number
    valueMax: number
    targetCount: number
}): TickPositionWithValue[] {
    const { height, paddingTop, paddingBottom, valueMin, valueMax, targetCount } = options

    const yStart = paddingTop
    const yEnd = Math.max(paddingTop, height - paddingBottom)
    const viewH = Math.max(0, yEnd - yStart)

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

// calculateValueTickPositions 缓存
let _cvtpCacheKey = ''
let _cvtpCacheResult: TickPositionWithValue[] = []

function buildCvtpCacheKey(options: CalculateValueTickPositionsOptions): string {
    return `${options.valueMin}:${options.valueMax}:${options.height}:${options.paddingTop}:${options.paddingBottom}:${options.isMain}:${options.scaleType ?? 'linear'}:${options.hideEdgeTicks ?? false}`
}

export function calculateValueTickPositions(
    options: CalculateValueTickPositionsOptions
): TickPositionWithValue[] {
    // 缓存命中：所有参数相同则直接返回
    const key = buildCvtpCacheKey(options)
    if (key === _cvtpCacheKey) return _cvtpCacheResult

    const { valueMin, valueMax, scaleType = 'linear' } = options

    if (scaleType === 'log') {
        if (valueMin <= 0) {
            // 递归调用走线性路径，线性路径会更新缓存
            return calculateValueTickPositions({ ...options, scaleType: 'linear' })
        }

        const effectiveMin = Math.max(valueMin, LOG_EPSILON)
        const effectiveMax = Math.max(valueMax, effectiveMin * 1.001)
        const { height, paddingTop, paddingBottom, isMain, hideEdgeTicks } = options
        const targetCount = Math.max(2, calculateTickCount(height, isMain))

        let positions = generatePixelUniformLogTicks({
            height,
            paddingTop,
            paddingBottom,
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

    if (scaleType === 'percent') {
        const { height, paddingTop, paddingBottom, isMain, hideEdgeTicks } = options
        const targetCount = Math.max(2, calculateTickCount(height, isMain))

        let positions = generatePixelUniformPercentTicks({
            height,
            paddingTop,
            paddingBottom,
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
    const totalTicks = calculateTickCount(options.height, options.isMain)
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
