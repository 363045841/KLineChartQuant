/** K 线蜡烛图 Layer：按可见范围准备实体/影线，优先 GPU 画笔，失败回退 Canvas2D。 */
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors, type VolumePriceColors } from '../../foundation/tokens/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import { getKLineTrend } from '../../foundation/types/kLine.js'
import type { KLineData } from '../../foundation/types/price.js'
import { ScaleType } from '../../foundation/types/scaleType.js'
import { VolumePriceRelation } from '../../foundation/types/volumePrice.js'
import {
  analyzeVolumePriceRelationBatch,
  DEFAULT_VOLUME_PRICE_CONFIG,
} from '../../foundation/utils/volumePrice.js'
import { createRetainedGeometry } from '../../rendering/scene/retainedGeometry.js'
import type { Layer } from '../../rendering/scene/types.js'
import {
  createProjectionRevision,
  sameProjectionRevision,
} from '../frame/impl/retainedProjection.js'
import type { ProjectionRevision } from '../frame/types.js'
import type { MarkerManager } from '../marker/registry.js'
import { calcBarLeftPx, fitBarWidthPx } from '../viewport/klineConfig.js'
import { drawWorldRectBatches } from './rectsViaRenderer.js'

const THICK_WICK_ZOOM_LEVEL = 10

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

type CandleMarker = {
  i: number
  relation: VolumePriceRelation
  alignedHighY: number
  alignedLowY: number
}

type PreparedCandles = {
  upMarkers: CandleMarker[]
  downMarkers: CandleMarker[]
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
export function createCandleLayer(): Layer<RenderContext> {
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
    paint(context) {
      if (context.dataView !== ChartDataViewId.KLine) return
      const { pane, data, range, kWidthPx, dpr, kLineCenters, markerManager, settings } = context
      const hollow = settings?.klineShape === 'hollow-candlestick'
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const klineData = data as KLineData[]
      if (!klineData.length) return
      const volumePriceMarkerManager = markerManager as MarkerManager | undefined
      const showVolumePriceMarkers =
        settings?.showVolumePriceMarkers !== false &&
        !!volumePriceMarkerManager &&
        (context.zoomLevel ?? 1) >= 2

      const build = () =>
        prepareCandles({
          pane,
          data: klineData,
          range,
          kWidthPx,
          dpr,
          kLineCenters,
          zoomLevel: context.zoomLevel ?? 1,
          showVolumePriceMarkers,
          buffers,
          hollow,
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
                showVolumePriceMarkers,
                hollow,
              ]),
              build,
            )

      const upColor = colors.candleUpBody
      const downColor = colors.candleDownBody
      drawWorldRectBatches(context, [
        { buf: prepared.upBodyBuf, count: prepared.upBodyCount, color: upColor },
        { buf: prepared.downBodyBuf, count: prepared.downBodyCount, color: downColor },
        { buf: prepared.upWickBuf, count: prepared.upWickCount, color: upColor },
        { buf: prepared.downWickBuf, count: prepared.downWickCount, color: downColor },
      ])

      if (showVolumePriceMarkers) {
        drawVolumePriceMarkers(context, prepared, volumePriceMarkerManager!, colors.volumePrice)
      }
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
  showVolumePriceMarkers: boolean
  buffers: CandleBuffers
  hollow: boolean
}): PreparedCandles {
  const { pane, data, range, kWidthPx, dpr, kLineCenters, showVolumePriceMarkers, buffers } = args
  const relations = showVolumePriceMarkers
    ? analyzeVolumePriceRelationBatch(data, range.start, range.end, DEFAULT_VOLUME_PRICE_CONFIG)
    : null

  const upMarkers: CandleMarker[] = []
  const downMarkers: CandleMarker[] = []
  const maxRects = Math.max(1, range.end - range.start)
  const upBodyBuf = ensureBufferCapacity(buffers.upBody, maxRects * (args.hollow ? 4 : 1) * 4)
  buffers.upBody = upBodyBuf
  const downBodyBuf = ensureBufferCapacity(buffers.downBody, maxRects * (args.hollow ? 4 : 1) * 4)
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

  const invDpr = 1 / dpr
  // 两档均为固定物理像素，不随 DPR 增粗；实体与影线同奇偶，保证居中和整数边界。
  const wickWidthPx = args.zoomLevel >= THICK_WICK_ZOOM_LEVEL ? 2 : 1
  const bodyWidthPx = fitBarWidthPx(kWidthPx, wickWidthPx)
  const wickWidth = wickWidthPx * invDpr

  for (let i = range.start; i < range.end && i < data.length; i++) {
    const e = data[i]
    if (!e) continue

    const centerLogical = kLineCenters[i - range.start]
    if (centerLogical === undefined) continue

    const openPx = Math.round(fastPriceToY(e.open) * dpr)
    const closePx = Math.round(fastPriceToY(e.close) * dpr)
    const highPx = Math.round(fastPriceToY(e.high) * dpr)
    const lowPx = Math.round(fastPriceToY(e.low) * dpr)
    const alignedHighY = highPx * invDpr
    const alignedLowY = lowPx * invDpr

    const centerPx = Math.round(centerLogical * dpr)
    const roundedLeftPx = calcBarLeftPx(centerPx, bodyWidthPx)

    // 全部实体/影线几何在整数物理像素空间完成，最小实体高度也只占一个物理像素。
    const topPx = Math.min(openPx, closePx)
    const bodyHPx = Math.max(1, Math.abs(openPx - closePx))
    const bottomPx = topPx + bodyHPx

    const bodyX = roundedLeftPx * invDpr
    const bodyY = topPx * invDpr
    const bodyW = bodyWidthPx * invDpr
    const bodyH = bodyHPx * invDpr
    const wickLeftX = calcBarLeftPx(centerPx, wickWidthPx) * invDpr

    const preClose = i > 0 ? data[i - 1]?.close : undefined
    const trend = getKLineTrend(e, preClose)
    const isUp = trend === 'up'

    const relation = relations?.[i - range.start]
    if (relation !== undefined && relation !== VolumePriceRelation.OTHERS) {
      const targetMarkers = isUp ? upMarkers : downMarkers
      targetMarkers.push({ i, relation, alignedHighY, alignedLowY })
    }

    const bodyBuf = isUp ? upBodyBuf : downBodyBuf
    // 边框由不重叠的物理像素矩形组成，内部不填背景，保留足迹、网格等底层内容。
    // 太窄或十字星没有内部空间时，使用原有最小实体几何。
    const bodyRects: readonly (readonly number[])[] =
      args.hollow && bodyWidthPx > 2 && bodyHPx > 2
        ? [
            [bodyX, bodyY, bodyW, invDpr],
            [bodyX, (bottomPx - 1) * invDpr, bodyW, invDpr],
            [bodyX, (topPx + 1) * invDpr, invDpr, (bodyHPx - 2) * invDpr],
            [
              (roundedLeftPx + bodyWidthPx - 1) * invDpr,
              (topPx + 1) * invDpr,
              invDpr,
              (bodyHPx - 2) * invDpr,
            ],
          ]
        : [[bodyX, bodyY, bodyW, bodyH]]
    for (const rect of bodyRects) {
      const bodyOff = (isUp ? upBodyCount++ : downBodyCount++) * 4
      bodyBuf.set(rect, bodyOff)
    }

    // 上下影线只取实体外的物理像素区间，不再重复价格方向和端点排序逻辑。
    const wickSegments: readonly [number, number][] = [
      [highPx, topPx],
      [bottomPx, lowPx],
    ]
    for (const [wickTop, wickBottom] of wickSegments) {
      if (wickBottom <= wickTop) continue
      const wickBuf = isUp ? upWickBuf : downWickBuf
      const wickOff = (isUp ? upWickCount++ : downWickCount++) * 4
      wickBuf.set(
        [wickLeftX, wickTop * invDpr, wickWidth, (wickBottom - wickTop) * invDpr],
        wickOff,
      )
    }
  }

  return {
    upMarkers,
    downMarkers,
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

function drawVolumePriceMarkers(
  context: RenderContext,
  prepared: PreparedCandles,
  markerManager: MarkerManager,
  volumePriceColors: VolumePriceColors,
): void {
  const { ctx, range, kWidth, dpr } = context

  ctx.save()
  ctx.translate(-context.scrollLeft, 0)

  for (const k of prepared.upMarkers) {
    const relation = k.relation
    const isRising =
      relation === VolumePriceRelation.RISE_WITH_VOLUME ||
      relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
    const markerY = isRising ? k.alignedHighY - 15 : k.alignedLowY + 15
    const posIndex = k.i - range.start
    const markerX = context.kLineCenters[posIndex]!
    drawVolumePriceMarker(
      ctx,
      markerX,
      markerY,
      relation,
      k.i,
      kWidth,
      4,
      markerManager,
      dpr,
      volumePriceColors,
    )
  }

  for (const k of prepared.downMarkers) {
    const relation = k.relation
    const isRising =
      relation === VolumePriceRelation.RISE_WITH_VOLUME ||
      relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
    const markerY = isRising ? k.alignedHighY - 15 : k.alignedLowY + 15
    const posIndex = k.i - range.start
    const markerX = context.kLineCenters[posIndex]!
    drawVolumePriceMarker(
      ctx,
      markerX,
      markerY,
      relation,
      k.i,
      kWidth,
      4,
      markerManager,
      dpr,
      volumePriceColors,
    )
  }

  ctx.restore()
}

/**
 * 绘制量价关系标记
 * 在K线图上标注量价关系标记符号
 *
 * @param ctx - Canvas绘图上下文
 * @param x - 标记的x坐标（三角形水平中心）
 * @param y - 标记的y坐标（三角形底边/顶点与K线的接触点）
 * @param relation - 量价关系类型
 * @param kWidth - K线宽度，作为三角形边长
 * @param gap - 三角形与K线的间距，默认为4
 * @param dpr - 设备像素比
 */
function drawVolumePriceMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  relation: VolumePriceRelation,
  kIndex: number,
  kWidth: number,
  gap: number = 4,
  markerManager: MarkerManager,
  dpr: number,
  volumePriceColors: VolumePriceColors,
): void {
  const align = (v: number) => Math.round(v * dpr) / dpr
  x = align(x)
  y = align(y)

  const sideLength = Math.min(kWidth, 20)
  const height = (sideLength * Math.sqrt(3)) / 2

  let color: string
  let isUp: boolean

  switch (relation) {
    case VolumePriceRelation.RISE_WITH_VOLUME:
      color = volumePriceColors.riseWith
      isUp = true
      break
    case VolumePriceRelation.RISE_WITHOUT_VOLUME:
      color = volumePriceColors.riseWithout
      isUp = true
      break
    case VolumePriceRelation.FALL_WITH_VOLUME:
      color = volumePriceColors.fallWith
      isUp = false
      break
    case VolumePriceRelation.FALL_WITHOUT_VOLUME:
      color = volumePriceColors.fallWithout
      isUp = false
      break
    default:
      return
  }

  ctx.save()
  ctx.beginPath()

  if (isUp) {
    const baseY = align(y - gap)
    const tipY = align(baseY - height)

    ctx.moveTo(x, tipY)
    ctx.lineTo(align(x - sideLength / 2), baseY)
    ctx.lineTo(align(x + sideLength / 2), baseY)
  } else {
    const baseY = align(y + gap)
    const tipY = align(baseY + height)

    ctx.moveTo(x, tipY)
    ctx.lineTo(align(x - sideLength / 2), baseY)
    ctx.lineTo(align(x + sideLength / 2), baseY)
  }

  ctx.closePath()

  ctx.fillStyle = color
  ctx.fill()

  ctx.restore()

  let boundingX: number
  let boundingY: number

  if (isUp) {
    const baseY = align(y - gap)
    const tipY = align(baseY - height)
    boundingX = align(x - sideLength / 2)
    boundingY = tipY
  } else {
    const baseY = align(y + gap)
    boundingX = align(x - sideLength / 2)
    boundingY = baseY
  }

  let markerTypeKey: string
  switch (relation) {
    case VolumePriceRelation.RISE_WITH_VOLUME:
      markerTypeKey = 'RISE_WITH_VOLUME'
      break
    case VolumePriceRelation.RISE_WITHOUT_VOLUME:
      markerTypeKey = 'RISE_WITHOUT_VOLUME'
      break
    case VolumePriceRelation.FALL_WITH_VOLUME:
      markerTypeKey = 'FALL_WITH_VOLUME'
      break
    case VolumePriceRelation.FALL_WITHOUT_VOLUME:
      markerTypeKey = 'FALL_WITHOUT_VOLUME'
      break
    default:
      return
  }

  const markerId = `mk_price-volume_${kIndex}`
  markerManager.register({
    id: markerId,
    type: 'triangle',
    markerType: markerTypeKey,
    x: boundingX,
    y: boundingY,
    width: sideLength,
    height: height,
    dataIndex: kIndex,
    metadata: { relation },
  })
}
