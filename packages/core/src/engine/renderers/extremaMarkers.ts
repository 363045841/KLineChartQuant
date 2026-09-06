import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../foundation/plugin/index'
import { Indicator } from '../indicators/indicatorDefinitionRegistry'
import { resolveThemeColors } from '../../foundation/tokens/index'
import type { KLineData } from '../../foundation/types/price'
import { ChartDataViewId } from '../../foundation/types/chartView'
import {
  roundToPhysicalPixel,
  alignToPhysicalPixelCenter,
  createHorizontalLineRect,
  worldXToScreenX,
} from '../../foundation/utils/pixelAlign'
import { isOnRightHalf } from '../../foundation/utils/viewportSide'
import { getFont, setCanvasFont } from '../../foundation/tokens/fonts'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 256

// 模块级常量，避免每次重复创建
const PADDING = 4
const LINE_LENGTH = 30
const DOT_RADIUS = 2
const MARKER_FONT = getFont(12)
const TAU = Math.PI * 2

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
  endX: number
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
 * 分三个阶段：线条 → 圆点 → 文字，避免 Canvas 状态频繁切换
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

  // ========== 阶段2：批量绘制所有圆点（复用 fillStyle）==========
  ctx.beginPath()
  for (const m of markers) {
    ctx.moveTo(m.endX + DOT_RADIUS, m.alignedY)
    ctx.arc(m.endX, m.alignedY, DOT_RADIUS, 0, TAU)
  }
  ctx.fill()

  // ========== 阶段3：批量绘制所有文字（同一 font/baseline/fillStyle）==========
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
        data,
        range,
        scrollLeft,
        dpr,
        paneWidth,
        kLineCenters,
        kWidth,
        kGap,
      } = context
      const ctx = overlayCtx
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const klineData = data as KLineData[]
      if (!klineData.length) return
      if (pane.role !== 'price') return
      if (!ctx) return

      const start = Math.max(0, range.start)
      const end = Math.min(klineData.length, range.end)
      if (end - start <= 0) return

      const strictStart = Math.max(0, range.start + 1)
      const strictEnd = Math.min(klineData.length, range.end - 1)
      const hasStrict = strictEnd - strictStart > 0

      // 扩展范围极值（±1 扩展缓冲内的全局极值）
      let max = -Infinity
      let min = Infinity
      let maxIndex = start
      let minIndex = start

      for (let i = start; i < end; i++) {
        const e = klineData[i]
        if (!e) continue
        if (e.high >= max) {
          max = e.high
          maxIndex = i
        }
        if (e.low <= min) {
          min = e.low
          minIndex = i
        }
      }

      if (!Number.isFinite(max) || !Number.isFinite(min)) return

      // 严格可见范围极值（剥离 ±1，作为 fallback）
      let strictMax = -Infinity
      let strictMin = Infinity
      let strictMaxIdx = strictStart
      let strictMinIdx = strictStart

      if (hasStrict) {
        for (let i = strictStart; i < strictEnd; i++) {
          const e = klineData[i]
          if (!e) continue
          if (e.high >= strictMax) {
            strictMax = e.high
            strictMaxIdx = i
          }
          if (e.low <= strictMin) {
            strictMin = e.low
            strictMinIdx = i
          }
        }
      }

      const getScreenCenterX = (i: number) => {
        const localIdx = i - range.start
        if (localIdx < 0 || localIdx >= kLineCenters.length) return NaN
        return worldXToScreenX(kLineCenters[localIdx]!, scrollLeft, dpr)
      }

      const inViewport = (screenX: number) =>
        Number.isFinite(screenX) && screenX >= 0 && screenX <= paneWidth

      // 首选全局极值（center 在视口内），否则 fallback 到严格范围极值，防止标记被吞
      const pickExtreme = (
        globalIdx: number,
        globalVal: number,
        strictIdx: number,
        strictVal: number,
      ): { idx: number; val: number; screenX: number } | null => {
        const globalScreenX = getScreenCenterX(globalIdx)
        if (inViewport(globalScreenX)) {
          return { idx: globalIdx, val: globalVal, screenX: globalScreenX }
        }
        if (hasStrict) {
          const strictScreenX = getScreenCenterX(strictIdx)
          if (inViewport(strictScreenX)) {
            return { idx: strictIdx, val: strictVal, screenX: strictScreenX }
          }
        }
        return null
      }

      const maxResult = pickExtreme(maxIndex, max, strictMaxIdx, strictMax)
      const minResult = pickExtreme(minIndex, min, strictMinIdx, strictMin)

      const markers: MarkerData[] = []
      const kStep = kWidth + kGap

      if (maxResult) {
        const distToEdge = Math.min(maxResult.screenX, paneWidth - maxResult.screenX)
        const maxMarker = createMarkerData(
          maxResult.screenX,
          pane.yAxis.priceToY(maxResult.val),
          maxResult.val,
          dpr,
          paneWidth,
          ctx,
          distToEdge < kStep,
        )
        if (maxMarker) markers.push(maxMarker)
      }

      if (minResult) {
        const distToEdge = Math.min(minResult.screenX, paneWidth - minResult.screenX)
        const minMarker = createMarkerData(
          minResult.screenX,
          pane.yAxis.priceToY(minResult.val),
          minResult.val,
          dpr,
          paneWidth,
          ctx,
          distToEdge < kStep,
        )
        if (minMarker) markers.push(minMarker)
      }

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
  isBoundary: boolean = false,
): MarkerData | null {
  const text = price.toFixed(2)
  const textWidth = measureTextWidth(ctx, text)

  const lineLength = isBoundary ? LINE_LENGTH * 2 : LINE_LENGTH
  const drawLeft = isOnRightHalf(x, paneWidth)

  let lineStartX = x
  let lineEndX = drawLeft ? x - lineLength : x + lineLength
  if (lineStartX > lineEndX) {
    ;[lineStartX, lineEndX] = [lineEndX, lineStartX]
  }

  const endX = roundToPhysicalPixel(lineEndX, dpr)
  const alignedY = alignToPhysicalPixelCenter(y, dpr)
  const textX = roundToPhysicalPixel(
    drawLeft ? x - lineLength - PADDING : x + lineLength + PADDING,
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
    endX,
    alignedY,
    textX,
  }
}
