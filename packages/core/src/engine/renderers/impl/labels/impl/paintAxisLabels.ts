/**
 * 轴标签统一绘制：把 ready-to-draw 标签按表面布局到目标轴 canvas。
 *
 * 布局/物理像素对齐规则集中在此处，轴渲染器只负责提供画布与度量。
 */

import type {
  AxisLabel,
  AxisLabelSurface,
  AxisTagLabel,
  AxisTickLabel,
} from '@/foundation/plugin/types.js'
import { AXIS_LABEL_KIND } from '@/foundation/plugin/types.js'
import { getFont, setCanvasFont } from '@/foundation/tokens/fonts.js'
import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '@/foundation/utils/pixelAlign.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive, TextPaintPrimitive } from '@/rendering/primitives/types.js'
import type { AxisLabelMetrics } from '../types.js'
import { buildLastPriceLabelText, getLastPriceLabelHeight } from './lastPriceLabel.js'

/** 标签布局输出公共文字命令，具体执行统一交给原语后端。 */
function labelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): TextPaintPrimitive {
  return {
    kind: 'text',
    text,
    x,
    y,
    font: ctx.font,
    color: String(ctx.fillStyle),
    align: ctx.textAlign,
    baseline: ctx.textBaseline,
  }
}

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 512

/** 测量文本宽度，按 font+text 缓存，避免逐标签重复 measureText。 */
function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}\n${text}`
  const cached = textWidthCache.get(key)
  if (cached !== undefined) return cached

  const width = ctx.measureText(text).width
  if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) textWidthCache.clear()
  textWidthCache.set(key, width)
  return width
}

/** X 表面（底部时间轴）的标签按水平位置绘制，其余按垂直位置。 */
function isXSurface(surface: AxisLabelSurface): boolean {
  return surface === 'xTicks' || surface === 'xCrosshair' || surface === 'xLabels'
}

/** 绘制刻度文字：X 表面居中于轴高，Y 表面按对齐方式贴轴宽。 */
function paintTick(
  ctx: CanvasRenderingContext2D,
  label: AxisTickLabel,
  surface: AxisLabelSurface,
  metrics: AxisLabelMetrics,
  commands: PaintPrimitive[],
): void {
  setCanvasFont(ctx, getFont(label.fontSize ?? 12, { bold: label.bold }))
  ctx.textBaseline = 'middle'
  ctx.fillStyle = label.color
  if (isXSurface(surface)) {
    ctx.textAlign = 'center'
    commands.push(
      labelText(
        ctx,
        label.text,
        roundToPhysicalPixel(label.pos, metrics.dpr),
        alignToPhysicalPixelCenter(metrics.axisHeight / 2, metrics.dpr),
      ),
    )
    return
  }
  ctx.textAlign = label.align ?? 'center'
  const offsetX = metrics.offsetX ?? 0
  const x =
    label.align === 'right'
      ? offsetX + metrics.axisWidth - 4
      : label.align === 'left'
        ? offsetX + 4
        : offsetX + metrics.axisWidth / 2
  commands.push(labelText(ctx, label.text, roundToPhysicalPixel(x, metrics.dpr), label.pos))
}

/** 绘制色块标签：X 表面为竖直时间签，Y 表面为横向价格签。 */
function paintTag(
  ctx: CanvasRenderingContext2D,
  label: AxisTagLabel,
  surface: AxisLabelSurface,
  metrics: AxisLabelMetrics,
  commands: PaintPrimitive[],
): void {
  const fontSize = label.fontSize ?? 12
  const origin = label.origin ?? 0
  const dpr = metrics.dpr
  ctx.save()
  setCanvasFont(ctx, getFont(fontSize))
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  if (isXSurface(surface)) {
    const paddingX = label.paddingX ?? 8
    const textWidth = Math.round(measureTextWidth(ctx, label.text))
    const rectW = Math.min(metrics.axisWidth, textWidth + paddingX * 2)
    const rectH = metrics.axisHeight
    const centerX = Math.min(
      Math.max(label.pos, origin + rectW / 2),
      origin + metrics.axisWidth - rectW / 2,
    )
    const centerY = origin + metrics.axisHeight / 2
    const rectX = centerX - rectW / 2
    ctx.fillStyle = label.bgColor
    commands.push({
      kind: 'rect',
      x: roundToPhysicalPixel(rectX, dpr),
      y: roundToPhysicalPixel(origin, dpr),
      width: roundToPhysicalPixel(rectW, dpr),
      height: roundToPhysicalPixel(rectH, dpr),
      color: label.bgColor,
    })
    ctx.fillStyle = label.textColor
    commands.push(
      labelText(
        ctx,
        label.text,
        roundToPhysicalPixel(centerX, dpr),
        alignToPhysicalPixelCenter(centerY, dpr),
      ),
    )
    ctx.restore()
    return
  }

  const countdown = label.type === 'lastPrice' ? label.countdown : null
  const rectH = countdown ? getLastPriceLabelHeight(fontSize) : fontSize + 4
  const yy = Math.min(
    Math.max(label.pos, origin + rectH / 2),
    origin + metrics.axisHeight - rectH / 2,
  )
  const ry = roundToPhysicalPixel(yy - rectH / 2, dpr)
  const rw = metrics.axisWidth
  const rh = roundToPhysicalPixel(rectH, dpr)
  const offsetX = metrics.offsetX ?? 0
  ctx.fillStyle = label.bgColor
  commands.push({ kind: 'rect', x: offsetX, y: ry, width: rw, height: rh, color: label.bgColor })
  if (label.borderColor) {
    const x = alignToPhysicalPixelCenter(offsetX, dpr),
      y = alignToPhysicalPixelCenter(ry, dpr)
    const right = x + Math.max(0, rw - 1 / dpr),
      bottom = y + Math.max(0, rh - 1 / dpr)
    commands.push({
      kind: 'stroke',
      paths: [
        [
          { x, y },
          { x: right, y },
          { x: right, y: bottom },
          { x, y: bottom },
        ],
      ],
      closed: true,
      color: label.borderColor,
      width: 1,
    })
  }
  const centerX = offsetX + rw / 2
  ctx.fillStyle = label.textColor
  if (countdown) {
    commands.push(
      ...buildLastPriceLabelText(labelText(ctx, label.text, centerX, yy), countdown, fontSize, dpr),
    )
  } else if (label.variant === 'crosshair') {
    commands.push(
      labelText(
        ctx,
        label.text,
        roundToPhysicalPixel(centerX, dpr),
        alignToPhysicalPixelCenter(yy, dpr),
      ),
    )
  } else {
    commands.push(
      labelText(
        ctx,
        label.text,
        roundToPhysicalPixel(centerX, dpr),
        roundToPhysicalPixel(yy, dpr) + 1,
      ),
    )
  }
  ctx.restore()
}

/**
 * 绘制指定表面的全部轴标签。
 *
 * @param ctx - 目标轴 canvas 的 2D 上下文
 * @param labels - 该表面的 ready-to-draw 标签（按注册顺序绘制）
 * @param surface - 目标轴表面
 * @param metrics - 画布度量（dpr、轴宽、轴高）
 */
export function paintAxisLabels(
  ctx: CanvasRenderingContext2D,
  labels: ReadonlyArray<AxisLabel>,
  surface: AxisLabelSurface,
  metrics: AxisLabelMetrics,
): void {
  const commands: PaintPrimitive[] = []
  ctx.save()
  for (const label of labels) {
    if (label.kind === AXIS_LABEL_KIND.TICK) {
      paintTick(ctx, label, surface, metrics, commands)
    } else {
      paintTag(ctx, label, surface, metrics, commands)
    }
  }
  ctx.restore()
  primitiveSink()(ctx, commands, metrics.dpr)
}
