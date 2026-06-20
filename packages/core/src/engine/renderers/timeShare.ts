import type { RendererPlugin, RenderContext, RendererPluginWithHost, PluginHost } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import type { TimeShareData } from '../../types/price'
import { resolveThemeColors } from '../../tokens'
import { Indicator } from '../indicators/indicatorDefinitionRegistry'

/** 成交量区域占 pane 高度的比例（底部） */
const VOLUME_RATIO = 0.25

export function createTimeShareRendererPlugin(): RendererPluginWithHost {
  return {
    name: 'timeShare',
    version: '1.0.0',
    description: '股票分时图渲染器',
    debugName: '分时图',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN,

    onInstall(_host: PluginHost) {
    },

    draw(context: RenderContext) {
      const { ctx, pane, data, range, dpr, kLineCenters, scrollLeft, settings, kBarRects } = context
      if (context.period !== 'timeshare') return
      const tsData = data as TimeShareData[]
      if (!tsData.length) return

      const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
      const preClose = (settings?.preClose as number) ?? tsData[0]?.price ?? 0
      if (preClose === 0) return

      const paneHeight = pane.height
      const volumeAreaHeight = Math.round(paneHeight * VOLUME_RATIO * dpr) / dpr
      const priceAreaHeight = paneHeight - volumeAreaHeight

      const { start, end } = range
      const visibleCount = Math.min(end - start, tsData.length - start)
      const itemCount = Math.min(end, tsData.length) - start

      const xPositions: number[] = []
      const yPrices: number[] = []
      const yAvgs: number[] = []
      const volumes: number[] = []
      let maxVolume = 0

      for (let i = start; i < start + itemCount; i++) {
        const item = tsData[i]
        if (!item) continue
        const x = kLineCenters[i - start]
        if (x === undefined) continue
        xPositions.push(x)
        yPrices.push(pane.yAxis.priceToY(item.price))
        yAvgs.push(pane.yAxis.priceToY(item.average))
        volumes.push(item.volume)
        maxVolume = Math.max(maxVolume, item.volume)
      }

      if (xPositions.length < 2) return

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      const preCloseY = pane.yAxis.priceToY(preClose)

      drawPreCloseLine(ctx, xPositions, preCloseY, dpr, colors.timeSharePreClose)

      drawAreaFill(ctx, xPositions, yPrices, preCloseY, dpr,
        colors.timeShareAreaUp, colors.timeShareAreaDown)

      drawSegmentLine(ctx, xPositions, yPrices, dpr, colors.timeSharePriceLine, 2)

      drawSegmentLine(ctx, xPositions, yAvgs, dpr, colors.timeShareAvgLine, 1.5)

      drawVolumeBars(ctx, kBarRects, volumes, maxVolume, volumeAreaHeight, paneHeight, preClose, dpr, colors.volumeUp, colors.volumeDown, colors.volumeNeutral, tsData, start)

      ctx.restore()
    },
  }
}

function drawPreCloseLine(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  y: number,
  dpr: number,
  color: string,
): void {
  if (xPositions.length < 2) return
  const firstX = xPositions[0]
  const lastX = xPositions[xPositions.length - 1]

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(firstX, y)
  ctx.lineTo(lastX, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawAreaFill(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  yPrices: number[],
  baselineY: number,
  dpr: number,
  upColor: string,
  downColor: string,
): void {
  if (xPositions.length < 2) return

  const n = xPositions.length

  function buildPolygon(isAbove: boolean): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = [{ x: xPositions[0]!, y: baselineY }]
    const firstOnOurSide = isAbove
      ? yPrices[0]! <= baselineY
      : yPrices[0]! >= baselineY
    if (firstOnOurSide) {
      pts.push({ x: xPositions[0]!, y: yPrices[0]! })
    }

    for (let i = 0; i < n - 1; i++) {
      const x1 = xPositions[i]!, y1 = yPrices[i]!
      const x2 = xPositions[i + 1]!, y2 = yPrices[i + 1]!

      const y1OnOurSide = isAbove ? y1 <= baselineY : y1 >= baselineY
      const y2OnOurSide = isAbove ? y2 <= baselineY : y2 >= baselineY

      if (y1OnOurSide !== y2OnOurSide) {
        const t = (baselineY - y1) / (y2 - y1)
        const cx = x1 + t * (x2 - x1)
        pts.push({ x: cx, y: baselineY })
      }
      if (y2OnOurSide) {
        pts.push({ x: x2, y: y2 })
      }
    }

    pts.push({ x: xPositions[n - 1]!, y: baselineY })
    return pts
  }

  const abovePts = buildPolygon(true)
  if (abovePts.length >= 3) {
    const topY = Math.min(...abovePts.map((p) => p.y))
    ctx.save()
    const grad = ctx.createLinearGradient(0, topY, 0, baselineY)
    grad.addColorStop(0, upColor)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.beginPath()
    ctx.moveTo(abovePts[0]!.x, abovePts[0]!.y)
    for (let i = 1; i < abovePts.length; i++) {
      ctx.lineTo(abovePts[i]!.x, abovePts[i]!.y)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
  }

  const belowPts = buildPolygon(false)
  if (belowPts.length >= 3) {
    const botY = Math.max(...belowPts.map((p) => p.y))
    ctx.save()
    const grad = ctx.createLinearGradient(0, baselineY, 0, botY)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, downColor)
    ctx.beginPath()
    ctx.moveTo(belowPts[0]!.x, belowPts[0]!.y)
    for (let i = 1; i < belowPts.length; i++) {
      ctx.lineTo(belowPts[i]!.x, belowPts[i]!.y)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
  }
}

function drawSegmentLine(
  ctx: CanvasRenderingContext2D,
  xPositions: number[],
  yPositions: number[],
  _dpr: number,
  color: string,
  lineWidth: number,
): void {
  if (xPositions.length < 2) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(xPositions[0], yPositions[0])

  for (let i = 1; i < xPositions.length; i++) {
    ctx.lineTo(xPositions[i], yPositions[i])
  }

  ctx.stroke()
  ctx.restore()
}

function drawVolumeBars(
  ctx: CanvasRenderingContext2D,
  barRects: Array<{ x: number; width: number }>,
  volumes: number[],
  maxVolume: number,
  volumeAreaHeight: number,
  paneHeight: number,
  preClose: number,
  dpr: number,
  upColor: string,
  downColor: string,
  neutralColor: string,
  data: TimeShareData[],
  startIdx: number,
): void {
  if (!barRects.length || maxVolume <= 0) return

  const snappedBottom = Math.round(paneHeight * dpr) / dpr

  for (let i = 0; i < barRects.length; i++) {
    const volume = volumes[i]
    if (volume <= 0) continue

    const barHeight = (volume / maxVolume) * volumeAreaHeight
    const snappedH = Math.round(barHeight * dpr) / dpr
    const snappedY = snappedBottom - snappedH
    const { x, width } = barRects[i]!
    const idx = startIdx + i

    let barColor: string
    if (i > 0) {
      const price = data[idx].price
      const prevPrice = data[idx - 1].price
      if (price > prevPrice) barColor = upColor
      else if (price < prevPrice) barColor = downColor
      else barColor = neutralColor
    } else {
      if (data[idx].price > preClose) barColor = upColor
      else if (data[idx].price < preClose) barColor = downColor
      else barColor = neutralColor
    }

    const minSize = 1 / dpr
    const finalW = width > 0 ? Math.max(width, minSize) : 0
    const finalH = snappedH > 0 ? Math.max(snappedH, minSize) : 0

    ctx.fillStyle = barColor
    ctx.fillRect(x, snappedY, finalW, finalH)
  }
}

@Indicator({
  name: 'timeShare',
  displayName: '分时',
  category: 'main',
  defaultPaneId: 'main',
  mainPane: { rendererName: 'timeShare' },
})
class TimeShareIndicatorDefinition {
  static rendererFactory = createTimeShareRendererPlugin
}