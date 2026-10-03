import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { isDailyPeriod, isMinutePeriod } from '@/foundation/types/chartPeriod.js'
import { isTimeShareDataView } from '@/foundation/types/chartView.js'
import type { KLineData } from '@/foundation/types/price.js'
import { createHorizontalLineRect, createVerticalLineRect } from '@/foundation/utils/pixelAlign.js'
import type { Layer } from '@/rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '@/rendering/scene/types.js'

/**
 * 网格线 Layer：横向按像素均分铺满绘图区高度，纵向按月分割
 * （使用预计算的月边界，网格线对齐到 K 线实体中部），绘制到所有 pane。
 */
export function createGridLinesLayer(): Layer<RenderContext> {
  return {
    id: makePluginLayerId('gridLines'),
    role: 'background',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.GRID,
    visible: true,
    paint(context) {
      drawGridLines(context)
    },
    dispose() {},
  }
}

/** 网格线绘制体：与 pane 无关，读取帧上下文中的几何与主题。 */
function drawGridLines(context: RenderContext): void {
  const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters, settings } = context
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const klineData = data as KLineData[]
  if (!klineData.length) return
  if (settings?.showGridLines === false) return

  ctx.save()
  ctx.fillStyle = colors.gridMajor
  ctx.translate(-scrollLeft, 0)

  const plotWidth = ctx.canvas.width / dpr
  const startX = scrollLeft
  const endX = scrollLeft + plotWidth

  // Pane 分隔线：非首 pane 在顶部画一条横线
  if (pane.top > 0) {
    const h = createHorizontalLineRect(startX, endX, 0, dpr)
    if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
  }

  // 水平网格线：从预计算的 yAxisTicks 取 Y 位置，确保与轴刻度对齐
  if (context.yAxisTicks) {
    for (const tick of context.yAxisTicks) {
      const h = createHorizontalLineRect(startX, endX, tick.y, dpr)
      if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
    }
  }

  // 五日分时纵线直接读取帧级日边界几何，保证首尾和日间分隔线均与主序列同源。
  if (context.fiveDayTimeShareGeometry) {
    for (const x of context.fiveDayTimeShareGeometry.verticalGridLineXs) {
      const v = createVerticalLineRect(x, 0, pane.height, dpr)
      if (v) ctx.fillRect(v.x, v.y, v.width, v.height)
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
      const worldX = kLineCenters[localIdx]!

      const v = createVerticalLineRect(worldX, 0, pane.height, dpr)
      if (v) ctx.fillRect(v.x, v.y, v.width, v.height)
    }
  }

  ctx.restore()
}
