/** 轴列绘制：把布局结果重放为绘制原语，是标签模块唯一接触像素的地方。 */

import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '@/foundation/utils/pixelAlign.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { AxisColumn, AxisLabel } from '../types.js'
import { layoutAxisLabels, type PlacedAxisLabel } from './layout.js'
import { axisLabelFont, axisLineOffset, axisTagHeight } from './metrics.js'

/**
 * 在单条轴列上绘制全部标签。
 *
 * @param ctx 目标轴 canvas 的 2D 上下文
 * @param labels 该列的全部标签
 * @param column 列几何与投影
 */
export function paintAxisLabels(
  ctx: CanvasRenderingContext2D,
  labels: readonly AxisLabel[],
  column: AxisColumn,
): void {
  const commands: PaintPrimitive[] = []
  for (const placed of layoutAxisLabels(labels, column)) {
    paintPlaced(commands, placed, column)
  }
  primitiveSink()(ctx, commands, column.dpr)
}

/**
 * 追加单条标签的文字与底色。
 *
 * @param commands 绘制命令缓冲
 * @param placed 布局结果
 * @param column 列几何与投影
 */
function paintPlaced(
  commands: PaintPrimitive[],
  placed: PlacedAxisLabel,
  column: AxisColumn,
): void {
  const { label, lines, center } = placed
  const dpr = column.dpr
  const background = label.background
  const font = axisLabelFont(label.kind === 'time' ? label.bold === true : false)
  const color = background === undefined ? column.palette.text : column.palette.onBackground

  if (column.projection.kind === 'time') {
    if (background !== undefined) {
      const width = placed.width
      commands.push({
        kind: 'rect',
        x: roundToPhysicalPixel(center - width / 2, dpr),
        y: 0,
        width: roundToPhysicalPixel(width, dpr),
        height: roundToPhysicalPixel(column.height, dpr),
        color: background,
      })
    }
    pushText(commands, lines[0] ?? '', center, column.height / 2, font, color, dpr)
    return
  }

  if (background !== undefined) {
    const height = axisTagHeight(lines.length)
    commands.push({
      kind: 'rect',
      x: roundToPhysicalPixel(column.offsetX, dpr),
      y: roundToPhysicalPixel(center - height / 2, dpr),
      width: roundToPhysicalPixel(column.width, dpr),
      height: roundToPhysicalPixel(height, dpr),
      color: background,
    })
  }
  // 附注行（note，当前为最新价收盘倒计时）与主行同色，只降低不透明度，避免抢视线。
  const noteLine = label.kind === 'value' && label.note !== undefined ? 1 : -1
  lines.forEach((line, index) => {
    pushText(
      commands,
      line,
      column.offsetX + column.width / 2,
      center + axisLineOffset(index, lines.length),
      font,
      color,
      dpr,
      index === noteLine ? 0.7 : undefined,
    )
  })
}

/** 追加一条水平居中的文字命令，横纵坐标各自对齐物理像素。 */
function pushText(
  commands: PaintPrimitive[],
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  dpr: number,
  opacity?: number,
): void {
  commands.push({
    kind: 'text',
    text,
    x: roundToPhysicalPixel(x, dpr),
    y: alignToPhysicalPixelCenter(y, dpr),
    font,
    color,
    opacity,
    align: 'center',
    baseline: 'middle',
  })
}
