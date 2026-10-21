/** 绘制 Pane 内部的价格刻度网格与交易日期纵向网格。 */
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { PrimitiveRenderContext, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { isDailyPeriod, isMinutePeriod } from '@/foundation/types/chartPeriod.js'
import { isTimeShareDataView } from '@/foundation/types/chartView.js'
import type { KLineData } from '@/foundation/types/price.js'
import { createHorizontalLineRect, createVerticalLineRect } from '@/foundation/utils/pixelAlign.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { DrawListLayer } from '@/rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '@/rendering/scene/types.js'

/**
 * 网格线 Layer：横向按像素均分铺满绘图区高度，纵向按月分割
 * （使用预计算的月边界，网格线对齐到 K 线实体中部），绘制到所有 pane。
 *
 * 背景带必须是纯增量原语：主图带由可见 GPU 表面直接呈现，任何 ctx 绘制的背景
 * 都会落到它上方的 2D 画布，从而盖住蜡烛与指标。
 */
export function createGridLinesLayer(): DrawListLayer<RenderContext> {
  return {
    id: makePluginLayerId('gridLines'),
    role: 'background',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.GRID,
    visible: true,
    kind: 'draw-list',
    paint(context) {
      drawGridLines(context)
    },
    dispose() {},
  }
}

/** 网格线绘制体：与 pane 无关，读取帧上下文中的几何与主题。 */
function drawGridLines(context: PrimitiveRenderContext): void {
  const { pane, data, range, scrollLeft, dpr, kLineCenters, settings } = context
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const klineData = data as KLineData[]
  if (!klineData.length) return
  if (settings?.showGridLines === false) return

  const plotWidth = context.paneWidth
  const startX = scrollLeft
  const endX = scrollLeft + plotWidth
  /** 横向偏移在投影时一次扣除；图元坐标是屏幕逻辑像素。 */
  const rects: number[] = []
  const add = (rect: { x: number; y: number; width: number; height: number } | null | undefined) => {
    if (!rect) return
    rects.push(rect.x - scrollLeft, rect.y, rect.width, rect.height)
  }

  // Pane 边界由宿主分隔层绘制；网格线只覆盖内部，避免与分隔边框叠加。
  if (context.yAxisTicks) {
    for (const tick of context.yAxisTicks) {
      const h = createHorizontalLineRect(startX, endX, tick.y, dpr)
      if (h && h.y > 0 && h.y + h.height < pane.height) add(h)
    }
  }

  // 五日分时纵线直接读取帧级日边界几何，保证首尾和日间分隔线均与主序列同源。
  if (context.fiveDayTimeShareGeometry) {
    for (const x of context.fiveDayTimeShareGeometry.verticalGridLineXs) {
      add(createVerticalLineRect(x, 0, pane.height, dpr))
    }
  } else if (!isTimeShareDataView(context.dataView)) {
    const minutePeriod = isMinutePeriod(context.period)
    const boundaries = minutePeriod
      ? context.displayTimeFormatter.getDayBoundaries(klineData)
      : context.displayTimeFormatter.getMonthBoundaries(klineData)
    const showOnlyYear = !minutePeriod && !isDailyPeriod(context.period)

    for (const idx of boundaries) {
      if (idx < range.start || idx >= range.end || idx >= klineData.length) continue
      if (
        showOnlyYear &&
        !context.displayTimeFormatter.formatAxisMonthOrYear(klineData[idx]!.timestamp).isYear
      )
        continue

      // 使用帧级中心点，避免 kWidth 物理像素取整后与 K 线实体、十字线偏移。
      const localIdx = idx - range.start
      if (localIdx < 0 || localIdx >= kLineCenters.length) continue
      add(createVerticalLineRect(kLineCenters[localIdx]!, 0, pane.height, dpr))
    }
  }

  if (rects.length === 0) return
  const data64 = new Float64Array(rects.length)
  for (let index = 0; index < rects.length; index++) data64[index] = rects[index]!
  submitPrimitives(context, [{ kind: 'rects', data: data64, color: colors.gridMajor }], dpr)
}
