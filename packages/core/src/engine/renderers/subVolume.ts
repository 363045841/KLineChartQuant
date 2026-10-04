import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import { getKLineTrend } from '../../foundation/types/kLine.js'
import type { KLineData, TimeShareData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import { Indicator } from '../indicators/indicatorDefinitionRegistry.js'
import { type GetTitleInfoFn, IndicatorKind } from '../indicators/indicatorMetadata.js'
import { barVerticalRect } from './barGeometry/impl/projectBars.js'
import { createVolumeScaleLayer, formatVolumeScaleLabel } from './Indicator/scale/volume_scale.js'
import { drawWorldRectBatches } from './rectsViaRenderer.js'

interface VolumeRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
}

/**
 * 创建副图成交量 Layer。
 */
function createVolumeLayer(options: VolumeRendererOptions = {}): Layer<RenderContext> {
  const { paneId = 'sub' } = options
  const name = `volume_${paneId}`

  return {
    id: makePluginLayerId(name),
    role: 'indicator',
    pane: paneId,
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    paint(context) {
      drawVolume(context)
    },
    dispose() {},
  }
}

/** 成交量绘制体：K 线与分时共用，GPU 优先、Canvas2D 兜底。 */
function drawVolume(context: RenderContext): void {
  const { pane, data, range, dpr } = context
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  // K 线与分时量柱统一使用独立的成交量配色，不跟随主图价格线或 K 线实体色。
  const upVolume = colors.volumeUp
  const downVolume = colors.volumeDown
  const neutralVolume = colors.volumeNeutral
  const chartData = data as Array<KLineData | TimeShareData>
  if (!chartData.length) return

  const { start, end } = range

  let maxVolume = 0
  let minVolume = Infinity
  for (let i = start; i < end && i < chartData.length; i++) {
    const item = chartData[i]
    if (!item) continue
    const volume = item.volume
    if (volume !== undefined && volume !== null) {
      maxVolume = Math.max(maxVolume, volume)
      minVolume = Math.min(minVolume, volume)
    }
  }

  if (maxVolume === 0 || !Number.isFinite(minVolume)) return

  // 范围由 Pane 统一管理，关闭自动后保留鼠标平移和缩放。
  const displayRange = pane.yAxis.getDisplayRange()
  const displayMin = displayRange.minPrice
  const displayMax = displayRange.maxPrice
  const displayValueRange = displayMax - displayMin || 1
  const baseY = pane.height - ((0 - displayMin) / displayValueRange) * pane.height

  const maxRects = Math.max(1, end - start)
  const batches = [upVolume, downVolume, neutralVolume].map((color) => ({
    color,
    buf: new Float64Array(maxRects * 4),
    count: 0,
  }))

  for (let i = start; i < end; i++) {
    const item = chartData[i]
    if (!item) continue
    const volume = item.volume
    if (!volume) continue
    const barRect = context.kBarRects[i - start]
    if (!barRect || barRect.width <= 0) continue

    const y = pane.height - ((volume - displayMin) / displayValueRange) * pane.height
    const vertical = barVerticalRect(y, baseY, dpr)

    const previous = i > 0 ? chartData[i - 1] : undefined
    const color = judgeVolumeColor(item, previous, upVolume, downVolume, neutralVolume)

    const batch = batches[color === upVolume ? 0 : color === downVolume ? 1 : 2]!
    const off = batch.count++ * 4
    batch.buf[off] = barRect.x
    batch.buf[off + 1] = vertical.y
    batch.buf[off + 2] = barRect.width
    batch.buf[off + 3] = vertical.height
  }

  drawWorldRectBatches(context, batches)
}

/**
 * 判断成交量柱子颜色
 */
function judgeVolumeColor(
  data: KLineData | TimeShareData,
  previous: KLineData | TimeShareData | undefined,
  upColor: string,
  downColor: string,
  neutralColor: string,
): string {
  if ('price' in data) {
    const previousPrice = previous && 'price' in previous ? previous.price : undefined
    if (previousPrice === undefined) return neutralColor
    if (data.price > previousPrice) return upColor
    if (data.price < previousPrice) return downColor
    return neutralColor
  }
  const trend = getKLineTrend(data, previous && !('price' in previous) ? previous.close : undefined)
  if (trend === 'up') return upColor
  if (trend === 'down') return downColor
  return neutralColor
}

/** 成交量标题直接读取行情数据，与量柱共用颜色判定。 */
const getVolumeTitleInfo: GetTitleInfoFn = (
  data,
  index,
  _params,
  _stateReader,
  _instanceId,
  _paneId,
  colors,
) => {
  if (index === null) return { name: 'VOL', values: [] }
  const bar = data[index]
  return {
    name: 'VOL',
    values:
      bar && typeof bar.volume === 'number' && Number.isFinite(bar.volume)
        ? [
            {
              label: 'VOL',
              value: bar.volume,
              formattedValue: formatVolumeScaleLabel(bar.volume),
              color: judgeVolumeColor(
                bar,
                data[index - 1],
                colors.volumeUp,
                colors.volumeDown,
                colors.volumeNeutral,
              ),
            },
          ]
        : [],
  }
}

@Indicator({
  name: 'volume',
  displayName: 'VOL',
  kind: IndicatorKind.Indicator,
  category: 'volume',
  indicatorType: 'volume',
  defaultPaneId: 'sub',
  dataViews: [ChartDataViewId.KLine, ChartDataViewId.TimeShare],
  scaleRendererFactory: createVolumeScaleLayer,
  getTitleInfo: getVolumeTitleInfo,
})
export class VolumeIndicatorDefinition {
  static rendererFactory = createVolumeLayer
}
