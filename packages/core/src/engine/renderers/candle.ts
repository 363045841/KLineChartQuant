/** K 线蜡烛图 Layer：投影实体与影线，通过公共原语写入 Scene 指定目标。 */
import { HOLLOW_BODY_KLINE_SHAPES } from '../../foundation/config/chartSettings.js'
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import { getKLineTrend } from '../../foundation/types/kLine.js'
import type { KLineData } from '../../foundation/types/price.js'
import { ScaleType } from '../../foundation/types/scaleType.js'
import { createRetainedGeometry } from '../../rendering/scene/retainedGeometry.js'
import type { DrawListLayer } from '../../rendering/scene/types.js'
import {
  createProjectionRevision,
  sameProjectionRevision,
} from '../frame/impl/retainedProjection.js'
import type { ProjectionRevision } from '../frame/types.js'
import { paintBarBatches } from './barGeometry/impl/paintBars.js'
import { projectOhlc } from './ohlcGeometry/impl/projectOhlc.js'

/** 缓冲池属于 Layer，避免其他图表覆盖已保留的几何。 */
type CandleBuffers = {
  upBody: Float64Array | null
  downBody: Float64Array | null
  upWick: Float64Array | null
  downWick: Float64Array | null
}

function ensureBufferCapacity(pool: Float64Array | null, requiredFloats: number): Float64Array {
  if (pool && pool.length >= requiredFloats) return pool
  const newLen = Math.max(requiredFloats, Math.ceil((pool?.length ?? 0) * 1.5))
  return new Float64Array(newLen)
}

type PreparedCandles = {
  upBodyBuf: Float64Array
  upBodyCount: number
  downBodyBuf: Float64Array
  downBodyCount: number
  upWickBuf: Float64Array
  upWickCount: number
  downWickBuf: Float64Array
  downWickCount: number
}

/** 创建 K 线主体 Layer。形态直接取 settings.klineShape，作为唯一事实来源。 */
export function createCandleLayer(): DrawListLayer<RenderContext> {
  const buffers: CandleBuffers = { upBody: null, downBody: null, upWick: null, downWick: null }
  const retained = createRetainedGeometry<PreparedCandles, ProjectionRevision>(
    sameProjectionRevision,
  )
  return {
    id: makePluginLayerId('candle'),
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    kind: 'draw-list',
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const { pane, data, range, kWidthPx, dpr, kLineCenters, settings } = context
      const klineShape = settings?.klineShape
      const hollow = klineShape !== undefined && HOLLOW_BODY_KLINE_SHAPES.has(klineShape)
      const ohlcBar = settings?.klineShape === 'ohlc-bar'
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const klineData = data as KLineData[]
      if (!klineData.length) return

      const build = () =>
        prepareCandles({
          pane,
          data: klineData,
          range,
          kWidthPx,
          dpr,
          kLineCenters,
          zoomLevel: context.zoomLevel ?? 1,
          buffers,
          hollow,
          ohlcBar,
        })
      // 无版本的直接调用不能继续持有旧版本，缓冲将在下面重新写入。
      if (context.dataRevision === undefined) retained.clear()
      const prepared =
        context.dataRevision === undefined
          ? build()
          : retained.read(
              createProjectionRevision(context, [
                context.dataRevision,
                context.dataView,
                context.zoomLevel ?? 1,
                hollow,
                ohlcBar,
              ]),
              build,
            )

      const upColor = colors.candleUpBody
      const downColor = colors.candleDownBody
      paintBarBatches(context, [
        { buf: prepared.upBodyBuf, count: prepared.upBodyCount, color: upColor },
        { buf: prepared.downBodyBuf, count: prepared.downBodyCount, color: downColor },
        { buf: prepared.upWickBuf, count: prepared.upWickCount, color: upColor },
        { buf: prepared.downWickBuf, count: prepared.downWickCount, color: downColor },
      ])
    },
    dispose() {
      retained.clear()
      buffers.upBody = buffers.downBody = buffers.upWick = buffers.downWick = null
    },
  }
}

function prepareCandles(args: {
  pane: RenderContext['pane']
  data: KLineData[]
  range: { start: number; end: number }
  kWidthPx: number
  dpr: number
  kLineCenters: number[]
  zoomLevel: number
  buffers: CandleBuffers
  hollow: boolean
  ohlcBar: boolean
}): PreparedCandles {
  const { pane, data, range, kWidthPx, dpr, kLineCenters, buffers } = args

  const maxRects = Math.max(1, range.end - range.start)
  const bodyRectsPerBar = args.ohlcBar ? 3 : args.hollow ? 4 : 1
  const upBodyBuf = ensureBufferCapacity(buffers.upBody, maxRects * bodyRectsPerBar * 4)
  buffers.upBody = upBodyBuf
  const downBodyBuf = ensureBufferCapacity(buffers.downBody, maxRects * bodyRectsPerBar * 4)
  buffers.downBody = downBodyBuf
  const upWickBuf = ensureBufferCapacity(buffers.upWick, maxRects * 2 * 4)
  buffers.upWick = upWickBuf
  const downWickBuf = ensureBufferCapacity(buffers.downWick, maxRects * 2 * 4)
  buffers.downWick = downWickBuf
  let upBodyCount = 0
  let downBodyCount = 0
  let upWickCount = 0
  let downWickCount = 0

  // 预取 displayRange，避免循环内每根 K 线 4 次 getDisplayRange()
  const { maxPrice, minPrice } = pane.yAxis.getDisplayRange()
  const paddingTop = pane.yAxis.getPaddingTop()
  const paddingBottom = pane.yAxis.getPaddingBottom()
  const viewHeight = Math.max(1, pane.height - paddingTop - paddingBottom)
  const isLinear = pane.yAxis.getScaleType() === ScaleType.Linear
  let fastPriceToY: (price: number) => number
  if (isLinear) {
    const priceRange = maxPrice - minPrice || 1
    const scaleK = viewHeight / priceRange
    const scaleB = paddingTop + viewHeight
    fastPriceToY = (price: number) => scaleB - (price - minPrice) * scaleK
  } else {
    fastPriceToY = (price: number) => pane.yAxis.priceToY(price)
  }

  for (let i = range.start; i < range.end && i < data.length; i++) {
    const e = data[i]
    if (!e) continue

    const centerLogical = kLineCenters[i - range.start]
    if (centerLogical === undefined) continue

    const geometry = projectOhlc({
      openY: fastPriceToY(e.open),
      highY: fastPriceToY(e.high),
      lowY: fastPriceToY(e.low),
      closeY: fastPriceToY(e.close),
      center: centerLogical,
      widthPx: kWidthPx,
      dpr,
      zoomLevel: args.zoomLevel,
      shape: args.ohlcBar ? 'ohlc-bar' : args.hollow ? 'hollow-candlestick' : 'candlestick',
      separateBorder: false,
      mergeWick: true,
    })

    const preClose = i > 0 ? data[i - 1]?.close : undefined
    const trend = getKLineTrend(e, preClose)
    const isUp = trend === 'up'

    const bodyBuf = isUp ? upBodyBuf : downBodyBuf
    for (const rect of [...geometry.body, ...geometry.border]) {
      const bodyOff = (isUp ? upBodyCount++ : downBodyCount++) * 4
      bodyBuf.set(rect, bodyOff)
    }

    for (const rect of geometry.wick) {
      const wickBuf = isUp ? upWickBuf : downWickBuf
      const wickOff = (isUp ? upWickCount++ : downWickCount++) * 4
      wickBuf.set(rect, wickOff)
    }
  }

  return {
    upBodyBuf,
    upBodyCount,
    downBodyBuf,
    downBodyCount,
    upWickBuf,
    upWickCount,
    downWickBuf,
    downWickCount,
  }
}
