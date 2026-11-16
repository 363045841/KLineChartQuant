/** 绘制 Pane 内部的价格刻度网格、交易日期纵向网格与交易日分隔线。 */
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { PrimitiveRenderContext, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import {
  createTradingDayIndexer,
  frameTimeTicks,
  type TimeTickUnit,
  type TradingDaySession,
} from '@/foundation/time/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { isDailyPeriod, isIntradayPeriod, isMinutePeriod } from '@/foundation/types/chartPeriod.js'
import { isTimeShareDataView } from '@/foundation/types/chartView.js'
import type { KLineData } from '@/foundation/types/price.js'
import {
  alignToPhysicalPixelCenter,
  createHorizontalLineRect,
  createVerticalLineRect,
} from '@/foundation/utils/pixelAlign.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { DrawListLayer } from '@/rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '@/rendering/scene/types.js'

/** 交易日分隔线的虚线节奏（逻辑像素），与比较基准线共用同一视觉语言。 */
const TRADING_DAY_SEPARATOR_DASH = [4, 4] as const

/** 无分隔线时复用同一个空结果，避免每帧分配。 */
const NO_SEPARATORS: readonly number[] = Object.freeze([])

/**
 * 网格层：横向按价格刻度绘制，纵向按月/日边界绘制，绘制到所有 pane。
 *
 * 网格是背景：只受 pane 边界约束，不受内容区内缩约束；数据层的内容区裁切由 Scene 负责。
 *
 * 背景带必须是纯增量原语：主图带由可见 GPU 表面直接呈现，任何 ctx 绘制的背景
 * 都会落到它上方的 2D 画布，从而盖住蜡烛与指标。
 */
export function createGridLinesLayer(): DrawListLayer<RenderContext> {
  return {
    id: makePluginLayerId('gridLines'),
    role: 'content',
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
  const tradingDaySession = resolveTradingDaySession(context)

  const plotWidth = context.paneWidth
  const startX = scrollLeft
  const endX = scrollLeft + plotWidth
  /** 横向偏移在投影时一次扣除；图元坐标是屏幕逻辑像素。 */
  const rects: number[] = []
  const add = (
    rect: { x: number; y: number; width: number; height: number } | null | undefined,
  ) => {
    if (!rect) return
    rects.push(rect.x - scrollLeft, rect.y, rect.width, rect.height)
  }

  // 显示网格是独立开关；交易日分隔线只受自己的开关约束。
  if (settings?.showGridLines !== false) {
    // Pane 边界由宿主分隔层绘制；网格线只覆盖内部，避免与分隔边框叠加。
    if (context.yAxisTicks) {
      for (const tick of context.yAxisTicks) {
        const h = createHorizontalLineRect(startX, endX, tick.y, dpr)
        if (h && h.y > 0 && h.y + h.height < pane.height) add(h)
      }
    }

    // 五日分时纵线直接读取帧级日边界几何，保证首尾和日间分隔线均与主序列同源。
    // 网格是背景：纵向分隔线铺满整个 pane，数据层同样以 Pane 完整边界为限。
    if (context.timeShareGeometry) {
      for (const x of context.timeShareGeometry.verticalGridLineXs) {
        add(createVerticalLineRect(x, 0, pane.height, dpr))
      }
    } else if (!isTimeShareDataView(context.dataView)) {
      const minutePeriod = isMinutePeriod(context.period)
      const showOnlyYear = !minutePeriod && !isDailyPeriod(context.period)
      const unit: TimeTickUnit = minutePeriod ? 'day' : 'month'
      // 分钟周期的纵向网格全是日界；开启交易日分隔线时改由蓝色虚线表达，避免同一位置两条线。
      if (!minutePeriod || !tradingDaySession) {
        // 纵向网格只标历史月界与序列起点，未来留白不产生分隔线。
        const indexes = new Set<number>()
        if (range.start <= 0 && range.end > 0 && klineData.length > 0) indexes.add(0)
        const lastHistoryIndex = Math.min(range.end, klineData.length) - 1
        if (lastHistoryIndex >= range.start) {
          const ticks = frameTimeTicks({
            projection: context.coordinates,
            firstIndex: range.start,
            lastIndex: lastHistoryIndex,
            unit,
            timeZone: context.displayTimeFormatter.timeZone,
          })
          for (const tick of ticks) {
            if (showOnlyYear && !tick.major) continue
            indexes.add(tick.index)
          }
        }
        for (const idx of [...indexes].sort((left, right) => left - right)) {
          // 使用帧级中心点，避免 kWidth 物理像素取整后与 K 线实体、十字线偏移。
          const localIdx = idx - range.start
          if (localIdx < 0 || localIdx >= kLineCenters.length) continue
          add(createVerticalLineRect(kLineCenters[localIdx]!, 0, pane.height, dpr))
        }
      }
    }
  }

  const commands: PaintPrimitive[] = []
  if (rects.length > 0) {
    const data64 = new Float64Array(rects.length)
    for (let index = 0; index < rects.length; index++) data64[index] = rects[index]!
    commands.push({ kind: 'rects', data: data64, color: colors.gridMajor })
  }

  const separators = tradingDaySession
    ? collectTradingDaySeparatorXs(context, tradingDaySession)
    : NO_SEPARATORS
  if (separators.length > 0) {
    commands.push({
      kind: 'stroke',
      paths: separators.map((x) => [
        { x, y: 0 },
        { x, y: pane.height },
      ]),
      color: colors.tradingDaySeparator,
      width: 1 / dpr,
      dash: TRADING_DAY_SEPARATOR_DASH,
    })
  }

  submitPrimitives(context, commands, dpr)
}

/**
 * 当前帧可用的交易日归属会话；开关、周期、数据视图与市场会话任一不满足时返回 null。
 *
 * @param context 本帧绘制上下文
 * @returns 已开启且周期、视图适用的市场会话；否则为 null
 */
function resolveTradingDaySession(context: PrimitiveRenderContext): TradingDaySession | null {
  const { settings, marketSession, period, dataView } = context
  if (settings?.showTradingDaySeparator === false) return null
  if (!marketSession || !isIntradayPeriod(period) || isTimeShareDataView(dataView)) return null
  return marketSession
}

/**
 * 本帧交易日分隔线的屏幕 X 坐标。
 *
 * 只比较相邻两根 K 线的交易日归属：同一天不画，切换处落在两根 K 线之间的槽位边界。
 * 归属来自市场会话的 `tradingDayStartMinute`，不读取交易日历；日线及以上周期和分时
 * 视图分别以月界、日界表达，不重复绘制。
 *
 * @param context 本帧绘制上下文
 * @param session 已通过可见性判定的市场会话
 * @returns 已按物理像素对齐的屏幕 X 有序列表；没有分隔时为空
 */
function collectTradingDaySeparatorXs(
  context: PrimitiveRenderContext,
  session: TradingDaySession,
): readonly number[] {
  const { data, range, scrollLeft, kLineCenters, dpr } = context
  const klineData = data as KLineData[]
  const from = Math.max(1, range.start)
  const to = Math.min(range.end, klineData.length)
  if (to - from < 1) return NO_SEPARATORS

  // 时区偏移只按窗口中点解析一次；与时间轴刻度的取舍保持一致。
  const reference = klineData[Math.min(klineData.length - 1, (from + to - 1) >> 1)]!
  const dayIndex = createTradingDayIndexer(session, reference.timestamp)
  const xs: number[] = []
  for (let index = from; index < to; index++) {
    if (dayIndex(klineData[index]!.timestamp) === dayIndex(klineData[index - 1]!.timestamp))
      continue
    const left = kLineCenters[index - 1 - range.start]
    const right = kLineCenters[index - range.start]
    if (left === undefined || right === undefined) continue
    xs.push(alignToPhysicalPixelCenter((left + right) / 2 - scrollLeft, dpr))
  }
  return xs.length > 0 ? xs : NO_SEPARATORS
}
