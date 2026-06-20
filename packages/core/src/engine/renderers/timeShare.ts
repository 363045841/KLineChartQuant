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
      const { ctx, pane, data, range, dpr, kLineCenters, scrollLeft, settings } = context
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

      const lastPrice = tsData[Math.min(end - 1, tsData.length - 1)]?.price ?? preClose
      const isUp = lastPrice >= preClose
      const areaColor = isUp ? colors.timeShareAreaUp : colors.timeShareAreaDown

      drawAreaFill(ctx, xPositions, yPrices, preCloseY, dpr, areaColor)

      drawSegmentLine(ctx, xPositions, yPrices, dpr, colors.timeSharePriceLine, 2)

      drawSegmentLine(ctx, xPositions, yAvgs, dpr, colors.timeShareAvgLine, 1.5)

      drawVolumeBars(ctx, xPositions, volumes, maxVolume, volumeAreaHeight, paneHeight, preClose, dpr, colors.volumeUp, colors.volumeDown, tsData, start)

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
  color: string,
): void {
  if (xPositions.length < 2) return

  ctx.save()

  const topY = Math.min(...yPrices)
  const botY = Math.max(...yPrices, baselineY)
  const grad = ctx.createLinearGradient(0, topY, 0, botY)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.beginPath()
  ctx.moveTo(xPositions[0], baselineY)

  for (let i = 0; i < xPositions.length; i++) {
    ctx.lineTo(xPositions[i], yPrices[i])
  }

  ctx.lineTo(xPositions[xPositions.length - 1], baselineY)
  ctx.closePath()

  ctx.fillStyle = grad
  ctx.fill()
  ctx.restore()
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
  xPositions: number[],
  volumes: number[],
  maxVolume: number,
  volumeAreaHeight: number,
  paneHeight: number,
  preClose: number,
  dpr: number,
  upColor: string,
  downColor: string,
  data: TimeShareData[],
  startIdx: number,
): void {
  if (!xPositions.length || maxVolume <= 0) return

  const volumeTop = paneHeight - volumeAreaHeight
  const barWidth = Math.max(1, (xPositions[Math.min(1, xPositions.length - 1)] - xPositions[0]) * 0.6)

  for (let i = 0; i < xPositions.length; i++) {
    const volume = volumes[i]
    if (volume <= 0) continue

    const barHeight = (volume / maxVolume) * volumeAreaHeight
    const y = volumeTop + volumeAreaHeight - barHeight
    const idx = startIdx + i
    const isUp = i > 0
      ? data[idx].price >= data[idx - 1].price
      : data[idx].price >= preClose

    ctx.fillStyle = isUp ? upColor : downColor
    ctx.fillRect(xPositions[i] - barWidth / 2, y, barWidth, barHeight)
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