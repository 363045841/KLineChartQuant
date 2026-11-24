/**
 * 底部时间轴绘制：清屏、铺设时间范围带、绘制时间轴标签。
 *
 * 时间轴标签全部由轴标签模块产出（帧级收集一次），本文件只负责像素：
 * 不再构造渲染上下文，也不注册任何标签。
 */

import type { AxisColumn, AxisLabel } from '@/engine/axisLabels/index.js'
import { paintAxisLabels } from '@/engine/axisLabels/index.js'
import type { XAxisRange } from '@/foundation/plugin/index.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'

/**
 * 绘制时间轴。
 *
 * @param ctx 时间轴 canvas 的 2D 上下文
 * @param labels 时间轴标签（TIME_AXIS 分桶）
 * @param column 时间轴列几何（宽为可视宽，高为轴高）
 * @param ranges 本帧时间范围带，绘制在标签下方
 * @param scrollLeft 世界坐标到屏幕的横向偏移
 */
export function paintTimeAxis(
  ctx: CanvasRenderingContext2D,
  labels: readonly AxisLabel[],
  column: AxisColumn,
  ranges: ReadonlyArray<XAxisRange>,
  scrollLeft: number,
): void {
  const { dpr, width, height } = column
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  if (ranges.length > 0) {
    const commands = ranges.flatMap((range) => {
      const left = range.leftX - scrollLeft
      const right = range.rightX - scrollLeft
      if (right - left <= 0) return []
      return [
        {
          kind: 'fill' as const,
          paths: [
            [
              { x: left, y: 0 },
              { x: right, y: 0 },
              { x: right, y: height },
              { x: left, y: height },
            ],
          ],
          color: range.color,
          opacity: range.opacity,
        },
      ]
    })
    if (commands.length > 0) primitiveSink()(ctx, commands, dpr)
  }

  paintAxisLabels(ctx, labels, column)
}
