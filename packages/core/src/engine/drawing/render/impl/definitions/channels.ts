/**
 * 通道类图形定义：平行通道、平滑顶底、不相交通道与回归通道。
 */

import { midpoint } from '@/engine/drawing/geometry/impl/coordinateUtils.js'
import { buildFillPolygon } from '@/engine/drawing/geometry/impl/fillRegions.js'
import { computeLinearRegression } from '@/engine/drawing/geometry/impl/linearRegression.js'
import type { DrawingDefinition, ResolvedDrawingAnchor } from '@/engine/drawing/types.js'
import type { LinePrimitive } from '@/foundation/plugin/index.js'
import type { KLineData } from '@/foundation/types/price.js'

/** 将锚点逻辑索引解析为 seriesData 下标；越界或非有限返回 -1。 */
function getAnchorDataIndex(anchor: ResolvedDrawingAnchor, data: KLineData[]): number {
  if (!Number.isFinite(anchor.index)) return -1
  const index = Math.round(anchor.index)
  if (index < 0 || index >= data.length) return -1
  return index
}

/** 创建平行通道定义：四条锚点定义两条平行线与填充带。 */
export function createParallelChannelDefinition(): DrawingDefinition {
  return {
    kind: 'parallel-channel',
    minAnchors: 4,
    maxAnchors: 4,
    compute(drawing, context) {
      const [first, second, third, fourth] = drawing.anchors
      if (!first || !second || !third || !fourth) return { primitives: [] }
      const p1 = context.toScreen(first)
      const p2 = context.toScreen(second)
      const p3 = context.toScreen(third)
      const p4 = context.toScreen(fourth)
      const extend =
        (drawing.params as { extend?: LinePrimitive['extend'] } | undefined)?.extend ?? 'none'

      return {
        primitives: [
          {
            kind: 'area',
            points: buildFillPolygon('parallel-channel', [p1, p2, p3, p4]),
            closed: true,
            style: drawing.style,
          },
          { kind: 'line', a: p1, b: p2, extend, style: drawing.style },
          { kind: 'line', a: p3, b: p4, extend, style: drawing.style },
          // 中线：两条平行线的中间虚线，端点不是锚点，选中态也不画锚点圆。
          {
            kind: 'line',
            a: midpoint(p1, p3),
            b: midpoint(p2, p4),
            extend,
            showEndpoints: false,
            style: { ...drawing.style, strokeStyle: 'dashed' },
          },
        ],
      }
    },
  }
}

/** 创建平滑顶底定义：四条锚点定义两条水平线与填充带。 */
export function createFlatLineDefinition(): DrawingDefinition {
  return {
    kind: 'flat-line',
    minAnchors: 4,
    maxAnchors: 4,
    compute(drawing, context) {
      const [first, second, third, fourth] = drawing.anchors
      if (!first || !second || !third || !fourth) return { primitives: [] }

      const p1 = context.toScreen(first)
      const p2 = context.toScreen(second)
      const h1 = context.toScreen(third)
      const h2 = context.toScreen(fourth)

      return {
        primitives: [
          {
            kind: 'area',
            points: buildFillPolygon('flat-line', [p1, p2, h1, h2]),
            closed: true,
            style: drawing.style,
          },
          { kind: 'line', a: p1, b: p2, style: drawing.style },
          { kind: 'line', a: h1, b: h2, style: drawing.style },
        ],
      }
    },
  }
}

/** 创建不相交通道定义：四条锚点定义两条独立线段与环绕填充。 */
export function createDisjointChannelDefinition(): DrawingDefinition {
  return {
    kind: 'disjoint-channel',
    minAnchors: 4,
    maxAnchors: 4,
    compute(drawing, context) {
      const [firstStart, firstEnd, secondEnd, secondStart] = drawing.anchors
      if (!firstStart || !firstEnd || !secondEnd || !secondStart) return { primitives: [] }

      // 锚点顺序：0 第一条线起点、1 第一条线终点、2 第二条线终点、3 第二条线起点。
      const a0 = context.toScreen(firstStart)
      const a1 = context.toScreen(firstEnd)
      const a2 = context.toScreen(secondEnd)
      const a3 = context.toScreen(secondStart)

      return {
        primitives: [
          // 填充按 0 → 1 → 2 → 3 环绕，与两条线的方向一致，避免自交。
          {
            kind: 'area',
            points: buildFillPolygon('disjoint-channel', [a0, a1, a2, a3]),
            closed: true,
            style: drawing.style,
          },
          { kind: 'line', a: a0, b: a1, style: drawing.style },
          { kind: 'line', a: a2, b: a3, style: drawing.style },
        ],
      }
    },
  }
}

/** 创建回归通道定义：两个锚点间做线性回归，按 sigma 展开上下轨。 */
export function createRegressionChannelDefinition(): DrawingDefinition {
  return {
    kind: 'regression-channel',
    minAnchors: 2,
    maxAnchors: 2,
    compute(drawing, context) {
      const [first, second] = drawing.anchors
      if (!first || !second) return { primitives: [] }
      const firstIndex = getAnchorDataIndex(first, context.seriesData)
      const secondIndex = getAnchorDataIndex(second, context.seriesData)
      if (firstIndex < 0 && secondIndex < 0) return { primitives: [] }

      const clampedFirstIndex = Math.min(
        Math.max(Math.round(first.index), 0),
        context.seriesData.length - 1,
      )
      const clampedSecondIndex = Math.min(
        Math.max(Math.round(second.index), 0),
        context.seriesData.length - 1,
      )
      const startIndex = Math.min(clampedFirstIndex, clampedSecondIndex)
      const endIndex = Math.max(clampedFirstIndex, clampedSecondIndex)
      const slice = context.seriesData.slice(startIndex, endIndex + 1)
      const regression = computeLinearRegression(slice.map((item) => item.close))
      if (!regression) return { primitives: [] }

      const sigma = (drawing.params as { sigma?: number } | undefined)?.sigma ?? 2
      const offset = regression.stdDev * sigma
      const firstValue = regression.intercept
      const lastValue = regression.intercept + regression.slope * (slice.length - 1)

      const startAnchor = {
        id: `${drawing.id}-reg-start`,
        index: Math.round(first.index),
        time: context.seriesData[startIndex]!.timestamp,
        price: firstValue,
      }
      const endAnchor = {
        id: `${drawing.id}-reg-end`,
        index: Math.round(second.index),
        time: context.seriesData[endIndex]!.timestamp,
        price: lastValue,
      }
      const upperStartAnchor = {
        ...startAnchor,
        id: `${drawing.id}-reg-upper-start`,
        price: firstValue + offset,
      }
      const upperEndAnchor = {
        ...endAnchor,
        id: `${drawing.id}-reg-upper-end`,
        price: lastValue + offset,
      }
      const lowerStartAnchor = {
        ...startAnchor,
        id: `${drawing.id}-reg-lower-start`,
        price: firstValue - offset,
      }
      const lowerEndAnchor = {
        ...endAnchor,
        id: `${drawing.id}-reg-lower-end`,
        price: lastValue - offset,
      }

      const middleA = context.toScreen(startAnchor)
      const middleB = context.toScreen(endAnchor)
      const upperA = context.toScreen(upperStartAnchor)
      const upperB = context.toScreen(upperEndAnchor)
      const lowerA = context.toScreen(lowerStartAnchor)
      const lowerB = context.toScreen(lowerEndAnchor)

      return {
        primitives: [
          {
            kind: 'area',
            points: [upperA, upperB, lowerB, lowerA],
            closed: true,
            style: drawing.style,
          },
          // 中间回归线使用虚线
          {
            kind: 'line',
            a: middleA,
            b: middleB,
            style: { ...drawing.style, strokeStyle: 'dashed' },
          },
          { kind: 'line', a: upperA, b: upperB, style: drawing.style },
          { kind: 'line', a: lowerA, b: lowerB, style: drawing.style },
        ],
        computedAnchors: [startAnchor, endAnchor],
        meta: { sigma, stdDev: regression.stdDev, slope: regression.slope },
      }
    },
  }
}
