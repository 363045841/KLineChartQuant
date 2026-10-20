/**
 * 斐波那契档位：默认档位、参数覆盖与屏幕 y 坐标在绘制和命中检测间共享。
 */

import type { Point } from '@/foundation/geometry/index.js'

/** 默认回撤档位；图元参数可通过 levels 覆盖。 */
const DEFAULT_LEVELS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

/** 一个档位在屏幕上的水平线。 */
export interface FibLevelLine {
  readonly ratio: number
  readonly left: number
  readonly right: number
  readonly y: number
}

/** 读取图元配置的档位；空数组与未配置都按默认档位处理。 */
function resolveLevels(params: Record<string, unknown>): readonly number[] {
  const configured = (params as { levels?: number[] }).levels
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_LEVELS
}

/**
 * 按两个锚点计算每个档位的水平线。
 * @param params 图元参数，允许 levels 覆盖默认档位
 * @param a 第一个锚点的屏幕坐标
 * @param b 第二个锚点的屏幕坐标
 * @returns 每个档位的比例与左右端点
 */
export function fibLevelLines(params: Record<string, unknown>, a: Point, b: Point): FibLevelLine[] {
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  return resolveLevels(params).map((ratio) => ({
    ratio,
    left,
    right,
    y: a.y + (b.y - a.y) * ratio,
  }))
}
