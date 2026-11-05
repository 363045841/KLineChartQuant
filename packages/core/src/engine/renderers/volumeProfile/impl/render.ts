/**
 * 成交量分布的绘制层：把每段聚合结果投影成贴在该段左沿或右沿的横向直方图。
 *
 * 绘制按「可见段」裁剪：只处理与本帧可视区间相交的段，段跨度决定横条最大宽度，
 * 因此缩放、滚动与阶段长度变化都不需要额外的布局计算。
 * 配色口径对齐 TradingView：价值区内外的横条分两档取色，POC 与 VAH/VAL 各自独立线色，
 * 参考线默认横跨整段跨度，勾选延长后才继续向右延伸到穿越 K 线。
 */
import type { RenderContext } from '../../../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../../../foundation/plugin/index.js'
import type { ColorTokens } from '../../../../foundation/tokens/index.js'
import { resolveThemeColors } from '../../../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../../../foundation/types/chartView.js'
import type { KLineData } from '../../../../foundation/types/price.js'
import type { Layer } from '../../../../rendering/scene/types.js'
import { resolveIndicatorLayerId } from '../../../indicators/indicatorLayerNaming.js'
import {
  DEFAULT_VOLUME_PROFILE_PARAMS,
  MAX_BOX_WIDTH_PERCENT,
  MAX_PROFILE_ROWS,
  MIN_BOX_WIDTH_PERCENT,
  MIN_PROFILE_ROWS,
  type VolumeProfileBoxPosition,
  type VolumeProfileLevel,
  type VolumeProfileParams,
  type VolumeProfilePeriodUnit,
  type VolumeProfileResult,
  type VolumeProfileVolumeMode,
} from '../types.js'
import { buildVolumeProfile } from './build.js'
import { resolveVolumeProfileSlices } from './period.js'

/** 单根横条之间的垂直留缝（逻辑像素）；与 TV 一致地连续填充。 */
const PROFILE_BAR_GAP = 0
/** 横条宽度下限（逻辑像素），保证极小成交量也能看见。 */
const MIN_BAR_WIDTH = 1
/** 横条最大宽度占面板宽度的比例。 */
const MAX_BOX_WIDTH_RATIO = 0.6
/** 阶段数量上限，与指标定义里的输入范围保持一致。 */
const MAX_PERIOD_COUNT = 12

/** 可选的枚举取值表：参数来自运行期记录，必须逐项校验后才能使用。 */
const PERIOD_UNITS: ReadonlyArray<VolumeProfilePeriodUnit> = ['candle', 'day', 'week', 'month']
const VOLUME_MODES: ReadonlyArray<VolumeProfileVolumeMode> = ['total', 'updown', 'delta']
const BOX_POSITIONS: ReadonlyArray<VolumeProfileBoxPosition> = ['left', 'right']

/** 一段横条：宽度与颜色，按绘制顺序排列。 */
interface BarSegment {
  readonly width: number
  readonly color: string
}

/** 读取数值参数：非有限值时回落到默认值，并夹在给定区间内。 */
function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** 读取枚举参数：不在取值表内时回落到默认值。 */
function readEnum<T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return typeof value === 'string' && (allowed as ReadonlyArray<string>).includes(value)
    ? (value as T)
    : fallback
}

/** 读取布尔参数：仅接受真正的布尔值。 */
function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * 归一化绘制参数：指标实例首帧拿到的是 `undefined`，且用户改参后记录里可能只含被改动的字段，
 * 因此这里必须用默认值补齐并逐项校验，不能直接断言参数表已经是完整契约。
 */
function readParams(params: Record<string, unknown> | undefined): VolumeProfileParams {
  const defaults = DEFAULT_VOLUME_PROFILE_PARAMS
  return {
    periodCount: Math.round(
      readNumber(params?.periodCount, defaults.periodCount, 1, MAX_PERIOD_COUNT),
    ),
    periodUnit: readEnum(params?.periodUnit, PERIOD_UNITS, defaults.periodUnit),
    volumeMode: readEnum(params?.volumeMode, VOLUME_MODES, defaults.volumeMode),
    valueAreaPercent: readNumber(params?.valueAreaPercent, defaults.valueAreaPercent, 1, 100),
    rowSize: Math.round(
      readNumber(params?.rowSize, defaults.rowSize, MIN_PROFILE_ROWS, MAX_PROFILE_ROWS),
    ),
    boxWidthPercent: readNumber(
      params?.boxWidthPercent,
      defaults.boxWidthPercent,
      MIN_BOX_WIDTH_PERCENT,
      MAX_BOX_WIDTH_PERCENT,
    ),
    boxPosition: readEnum(params?.boxPosition, BOX_POSITIONS, defaults.boxPosition),
    extendPoc: readBoolean(params?.extendPoc, defaults.extendPoc),
    extendVah: readBoolean(params?.extendVah, defaults.extendVah),
    extendVal: readBoolean(params?.extendVal, defaults.extendVal),
    showPoc: readBoolean(params?.showPoc, defaults.showPoc),
    showVah: readBoolean(params?.showVah, defaults.showVah),
    showVal: readBoolean(params?.showVal, defaults.showVal),
  }
}

/** 判断某个价位桶是否落在价值区内：按桶中心比较，与 TradingView 的分档口径一致。 */
function isInsideValueArea(level: VolumeProfileLevel, profile: VolumeProfileResult): boolean {
  const center = (level.priceLow + level.priceHigh) / 2
  return center >= profile.valueAreaLow && center <= profile.valueAreaHigh
}

/**
 * 计算一根横条的分段宽度与颜色。
 *
 * `total` 与 `delta` 只有一段；`updown` 按上涨/下跌成交量比例拆成两段，
 * 颜色按「是否在价值区内」在强调色与中性色之间切换。
 */
function resolveBarSegments(
  profile: VolumeProfileResult,
  level: VolumeProfileLevel,
  mode: VolumeProfileVolumeMode,
  maxWidth: number,
  insideValueArea: boolean,
  palette: ColorTokens['volumeProfile'],
): ReadonlyArray<BarSegment> {
  if (mode === 'total') {
    const width =
      profile.maxLevelVolume > 0 ? (level.totalVolume / profile.maxLevelVolume) * maxWidth : 0
    return [{ width, color: insideValueArea ? palette.valueAreaUp : palette.up }]
  }
  if (mode === 'delta') {
    const delta = level.upVolume - level.downVolume
    const width =
      profile.maxLevelDelta > 0 ? (Math.abs(delta) / profile.maxLevelDelta) * maxWidth : 0
    const positive = delta >= 0
    const color = insideValueArea
      ? positive
        ? palette.valueAreaUp
        : palette.valueAreaDown
      : positive
        ? palette.up
        : palette.down
    return [{ width, color }]
  }
  const totalWidth =
    profile.maxLevelVolume > 0 ? (level.totalVolume / profile.maxLevelVolume) * maxWidth : 0
  if (level.totalVolume <= 0) return [{ width: totalWidth, color: palette.up }]
  const segments: BarSegment[] = [
    {
      width: (level.upVolume / level.totalVolume) * totalWidth,
      color: insideValueArea ? palette.valueAreaUp : palette.up,
    },
    {
      width: (level.downVolume / level.totalVolume) * totalWidth,
      color: insideValueArea ? palette.valueAreaDown : palette.down,
    },
  ]
  return segments
}

/** 画一条水平参考线。 */
function drawLevelLine(
  ctx: CanvasRenderingContext2D,
  xStart: number,
  xEnd: number,
  y: number,
  color: string,
  dpr: number,
): void {
  if (!Number.isFinite(y) || xEnd <= xStart) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  const alignedY = (Math.floor(y * dpr) + 0.5) / dpr
  ctx.moveTo(xStart, alignedY)
  ctx.lineTo(xEnd, alignedY)
  ctx.stroke()
  ctx.restore()
}

/**
 * 找价格向右延长时的终点：第一条覆盖该价格的 K 线的右沿。
 *
 * @returns 绘制用的 x 坐标；没有 K 线覆盖时停在面板右缘。
 */
function resolveExtendEnd(
  context: RenderContext,
  bars: ReadonlyArray<KLineData>,
  fromIndex: number,
  price: number,
): number {
  const { kLineCenters, kWidth, scrollLeft, paneWidth, range } = context
  const paneRightEdge = scrollLeft + paneWidth
  for (let index = fromIndex + 1; index < bars.length; index += 1) {
    const bar = bars[index]
    if (bar === undefined) continue
    if (price < bar.low || price > bar.high) continue
    const center = kLineCenters[index - range.start]
    if (center === undefined) return paneRightEdge
    return Math.min(paneRightEdge, center + kWidth / 2)
  }
  return paneRightEdge
}

/**
 * 创建成交量分布的绘制层。
 *
 * @param scope `session` 为按交易日重置，`periodic` 为按阶段的周期分布。
 * @param paneId 目标面板 id。
 * @param instanceId 指标实例 id。
 * @param params 指标参数。
 */
export function createVolumeProfileLayer(
  scope: 'session' | 'periodic',
  paneId: string,
  _instanceId: string,
  params: Record<string, unknown> | undefined,
): Layer<RenderContext> {
  return {
    id: resolveIndicatorLayerId(scope === 'session' ? 'svp' : 'pvp', paneId),
    role: 'overlay',
    pane: paneId,
    z: RENDERER_PRIORITY.LAST_PRICE_LABEL - 1,
    visible: true,
    dispose() {},
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const ctx = context.overlayCtx
      if (!ctx) return
      const bars = context.data as ReadonlyArray<KLineData>
      if (bars.length === 0) return

      const options = readParams(params)
      const { pane, kLineCenters, kWidth, scrollLeft, paneWidth, dpr } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const palette = colors.volumeProfile
      const timeZone = context.marketSession?.timeZone ?? 'UTC'
      const unit = scope === 'session' ? 'day' : options.periodUnit
      const count = scope === 'session' ? 1 : options.periodCount
      const slices = resolveVolumeProfileSlices(bars, unit, count, timeZone)
      if (slices.length === 0) return

      const visibleStart = context.range.start
      const visibleEnd = context.range.end
      const paneLeftEdge = scrollLeft
      const paneRightEdge = scrollLeft + paneWidth
      const widthPercent = Math.min(
        MAX_BOX_WIDTH_PERCENT,
        Math.max(MIN_BOX_WIDTH_PERCENT, options.boxWidthPercent),
      )

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      for (const slice of slices) {
        if (slice.endIndex < visibleStart || slice.startIndex > visibleEnd) continue
        // `kLineCenters` 只覆盖本帧可视区，索引相对 `range.start`，不能直接用数据下标取。
        const startCenter = kLineCenters[slice.startIndex - visibleStart]
        const endCenter = kLineCenters[slice.endIndex - visibleStart]
        if (startCenter === undefined || endCenter === undefined) continue
        const sliceLeft = startCenter - kWidth / 2
        const sliceRight = endCenter + kWidth / 2
        if (sliceRight < paneLeftEdge || sliceLeft > paneRightEdge) continue

        const profile = buildVolumeProfile(
          bars,
          slice.startIndex,
          slice.endIndex,
          options.rowSize,
          options.valueAreaPercent,
        )
        if (!profile) continue

        const maxWidth = Math.max(
          MIN_BAR_WIDTH,
          Math.min(
            (sliceRight - sliceLeft) * (widthPercent / 100),
            paneWidth * MAX_BOX_WIDTH_RATIO,
          ),
        )
        const boxLeft = options.boxPosition === 'left' ? sliceLeft : sliceRight - maxWidth
        const boxRight = boxLeft + maxWidth

        // 背景框：与 TV 的「直方图框底色」一致，先铺一层极淡底色再画横条。
        const topLevel = profile.levels[profile.levels.length - 1]
        const bottomLevel = profile.levels[0]
        if (topLevel !== undefined && bottomLevel !== undefined) {
          const boxTop = pane.yAxis.priceToY(topLevel.priceHigh)
          const boxBottom = pane.yAxis.priceToY(bottomLevel.priceLow)
          if (Number.isFinite(boxTop) && Number.isFinite(boxBottom)) {
            ctx.fillStyle = palette.boxBackground
            ctx.fillRect(boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop)
          }
        }

        for (const level of profile.levels) {
          const height = Math.abs(
            pane.yAxis.priceToY(level.priceLow) - pane.yAxis.priceToY(level.priceHigh),
          )
          // 行高不足 3 像素时不再留缝，否则高价区分行会碎成看不清的细线。
          const barHeight = height >= 3 ? Math.max(0, height - PROFILE_BAR_GAP) : height
          if (barHeight <= 0) continue

          const segments = resolveBarSegments(
            profile,
            level,
            options.volumeMode,
            maxWidth,
            isInsideValueArea(level, profile),
            palette,
          )
          const totalWidth = segments.reduce((sum, segment) => sum + segment.width, 0)
          if (totalWidth < MIN_BAR_WIDTH) continue
          const top = Math.round(pane.yAxis.priceToY(level.priceHigh) * dpr) / dpr

          let cursor = options.boxPosition === 'left' ? boxLeft : boxRight - totalWidth
          for (const segment of segments) {
            if (segment.width <= 0) continue
            ctx.fillStyle = segment.color
            ctx.fillRect(cursor, top, segment.width, barHeight)
            cursor += segment.width
          }
        }

        const lastIndex = slice.endIndex
        if (options.showPoc) {
          const price = profile.pointOfControl
          const end = options.extendPoc
            ? resolveExtendEnd(context, bars, lastIndex, price)
            : sliceRight
          drawLevelLine(
            ctx,
            sliceLeft,
            end,
            pane.yAxis.priceToY(price),
            palette.pointOfControl,
            dpr,
          )
        }
        if (options.showVah) {
          const price = profile.valueAreaHigh
          const end = options.extendVah
            ? resolveExtendEnd(context, bars, lastIndex, price)
            : sliceRight
          drawLevelLine(ctx, sliceLeft, end, pane.yAxis.priceToY(price), palette.valueAreaHigh, dpr)
        }
        if (options.showVal) {
          const price = profile.valueAreaLow
          const end = options.extendVal
            ? resolveExtendEnd(context, bars, lastIndex, price)
            : sliceRight
          drawLevelLine(ctx, sliceLeft, end, pane.yAxis.priceToY(price), palette.valueAreaLow, dpr)
        }
      }

      ctx.restore()
    },
  }
}
