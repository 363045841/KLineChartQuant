import type { RenderContext, RendererPlugin } from '../../foundation/plugin/index.js'
import { GLOBAL_PANE_ID, RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { getFont, setCanvasFont } from '../../foundation/tokens/fonts.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import {
  alignToPhysicalPixelCenter,
  createHorizontalLineRect,
  roundToPhysicalPixel,
  worldXToScreenX,
} from '../../foundation/utils/pixelAlign.js'
import { isOnRightHalf } from '../../foundation/utils/viewportSide.js'
import { Indicator } from '../indicators/indicatorDefinitionRegistry.js'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 256

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
  textWidth: number
  drawLeft: boolean
  lineStartX: number
  lineEndX: number
  alignedY: number
  textX: number
}

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  // 使用固定字体，缓存更稳定
  const key = MARKER_FONT + '|' + text
  const cached = textWidthCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const savedFont = ctx.font
  ctx.font = MARKER_FONT
  const width = ctx.measureText(text).width
  ctx.font = savedFont

  if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
    textWidthCache.clear()
  }
  textWidthCache.set(key, width)
  return width
}

/**
 * 批量绘制所有 marker
 * 分两个阶段：线条 → 文字，避免 Canvas 状态频繁切换
 */
function drawAllMarkers(
  ctx: CanvasRenderingContext2D,
  markers: MarkerData[],
  dpr: number,
  lineColor: string,
  textColor: string,
) {
  if (markers.length === 0) return

  ctx.save()

  // ========== 阶段1：批量绘制所有线条（同一 fillStyle）==========
  ctx.fillStyle = lineColor
  for (const m of markers) {
    const lineRect = createHorizontalLineRect(m.lineStartX, m.lineEndX, m.y, dpr)
    if (lineRect) {
      ctx.fillRect(lineRect.x, lineRect.y, lineRect.width, lineRect.height)
    }
  }

  // ========== 阶段2：批量绘制所有文字（同一 font/baseline/fillStyle）==========
  setCanvasFont(ctx, MARKER_FONT)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = textColor

  for (const m of markers) {
    ctx.textAlign = m.drawLeft ? 'right' : 'left'
    ctx.fillText(m.text, m.textX, m.alignedY)
  }

  ctx.restore()
}

/**
 * 创建可视区最高/最低价标注渲染器插件
 */
export function createExtremaMarkersRendererPlugin(): RendererPlugin {
  return {
    name: 'extremaMarkers',
    version: '1.0.0',
    description: '可视区最高/最低价标注渲染器',
    debugName: '极值标记',
    paneId: GLOBAL_PANE_ID,
    layer: 'overlay',
    priority: RENDERER_PRIORITY.OVERLAY,

    draw(context: RenderContext) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const {
        overlayCtx,
        pane,
        range,
        scrollLeft,
        dpr,
        paneWidth,
        kLineCenters,
        visiblePriceExtrema,
      } = context
      const ctx = overlayCtx
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (pane.role !== 'price') return
      if (!ctx) return
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
        markers.push(
          createMarkerData(screenX, pane.yAxis.priceToY(value), value, dpr, paneWidth, ctx),
        )
      }

      pushMarker(maxIndex, max)
      pushMarker(minIndex, min)

      // 批量绘制所有 markers
      drawAllMarkers(ctx, markers, dpr, colors.text.weak, colors.text.primary)
    },
  }
}

@Indicator({
  name: 'extremaMarkers',
  displayName: '极值标记',
  category: 'main',
  indicatorType: 'other',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  mainPane: { rendererName: 'extremaMarkers' },
})
export class ExtremaMarkersIndicatorDefinition {
  static rendererFactory = createExtremaMarkersRendererPlugin
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
  ctx: CanvasRenderingContext2D,
): MarkerData {
  const text = price.toFixed(2)
  const textWidth = measureTextWidth(ctx, text)

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
    textWidth,
    drawLeft,
    lineStartX,
    lineEndX,
    alignedY,
    textX,
  }
}
