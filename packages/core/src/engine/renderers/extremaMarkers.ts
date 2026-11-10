/** 可视区最高/最低价标注 Layer（overlay 层，绘制到所有 pane）。 */

import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { getFont } from '../../foundation/tokens/fonts.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import {
  alignToPhysicalPixelCenter,
  createHorizontalLineRect,
  roundToPhysicalPixel,
  worldXToScreenX,
} from '../../foundation/utils/pixelAlign.js'
import { isOnRightHalf } from '../../foundation/utils/viewportSide.js'
import type { Layer } from '../../rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '../../rendering/scene/types.js'

// 模块级常量，避免每次重复创建
const PADDING = 4
const LINE_LENGTH = 30
const MARKER_FONT = getFont(12)

// Marker 数据接口，用于批量绘制
interface MarkerData {
  x: number
  y: number
  price: number
  text: string
  drawLeft: boolean
  lineStartX: number
  lineEndX: number
  alignedY: number
  textX: number
}

/**
 * 批量绘制所有 marker
 * 分两个阶段：线条 → 文字，避免 Canvas 状态频繁切换
 */
function buildMarkers(
  markers: MarkerData[],
  dpr: number,
  lineColor: string,
  textColor: string,
): PaintPrimitive[] {
  const commands: PaintPrimitive[] = []

  // ========== 阶段1：批量绘制所有线条（同一 fillStyle）==========
  for (const m of markers) {
    const lineRect = createHorizontalLineRect(m.lineStartX, m.lineEndX, m.y, dpr)
    if (lineRect) {
      commands.push({ kind: 'rect', ...lineRect, color: lineColor })
    }
  }

  // ========== 阶段2：批量绘制所有文字（同一 font/baseline/fillStyle）==========
  for (const m of markers) {
    commands.push({
      kind: 'text',
      text: m.text,
      x: m.textX,
      y: m.alignedY,
      font: MARKER_FONT,
      baseline: 'middle',
      align: m.drawLeft ? 'right' : 'left',
      color: textColor,
    })
  }
  return commands
}

/** 可视区最高/最低价标注 Layer（绘制到所有 pane 的 overlay 层）。 */
export function createExtremaMarkersLayer(): Layer<RenderContext> {
  return {
    kind: 'draw-list',
    id: makePluginLayerId('extremaMarkers'),
    role: 'overlay',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.OVERLAY,
    visible: true,
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const { pane, range, scrollLeft, dpr, paneWidth, kLineCenters, visiblePriceExtrema } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (pane.role !== 'price') return
      if (!visiblePriceExtrema) return
      const { max, min, maxIndex, minIndex } = visiblePriceExtrema

      const getScreenCenterX = (i: number) => {
        const localIdx = i - range.start
        if (localIdx < 0 || localIdx >= kLineCenters.length) return NaN
        return worldXToScreenX(kLineCenters[localIdx]!, scrollLeft, dpr)
      }

      const markers: MarkerData[] = []

      const pushMarker = (index: number, value: number): void => {
        const screenX = getScreenCenterX(index)
        if (!Number.isFinite(screenX)) return
        markers.push(createMarkerData(screenX, pane.yAxis.priceToY(value), value, dpr, paneWidth))
      }

      pushMarker(maxIndex, max)
      pushMarker(minIndex, min)

      // 批量绘制所有 markers
      submitPrimitives(
        context,
        buildMarkers(markers, dpr, colors.text.weak, colors.text.primary),
        dpr,
      )
    },
    dispose() {},
  }
}

/**
 * 创建 marker 数据（不绘制，只计算）
 */
function createMarkerData(
  x: number,
  y: number,
  price: number,
  dpr: number,
  paneWidth: number,
): MarkerData {
  const text = price.toFixed(2)

  const drawLeft = isOnRightHalf(x, paneWidth)

  let lineStartX = x
  let lineEndX = drawLeft ? x - LINE_LENGTH : x + LINE_LENGTH
  if (lineStartX > lineEndX) {
    ;[lineStartX, lineEndX] = [lineEndX, lineStartX]
  }

  const alignedY = alignToPhysicalPixelCenter(y, dpr)
  const textX = roundToPhysicalPixel(
    drawLeft ? x - LINE_LENGTH - PADDING : x + LINE_LENGTH + PADDING,
    dpr,
  )

  return {
    x,
    y,
    price,
    text,
    drawLeft,
    lineStartX,
    lineEndX,
    alignedY,
    textX,
  }
}
