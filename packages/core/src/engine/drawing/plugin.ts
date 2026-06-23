import type { RendererPlugin, RenderContext, DrawingStyle, DrawingPrimitive, YAxisLabel, XAxisLabel, YAxisRange, XAxisRange } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import {
  DrawingStore,
  DrawingDefinitionRegistry,
  createDefaultPrimitiveRendererSet,
  registerDefaultDrawingDefinitions,
} from './index'
import type { PrimitiveRendererSet } from './index'
import type { KLineData } from '../../types/price'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

type SafeViewport = { scrollLeft: number; plotWidth: number; plotHeight: number }
type ToScreenFn = (anchor: { index: number; price: number }) => { x: number; y: number }

function resolveViewport(context: RenderContext, paneHeight: number): SafeViewport {
  return context.viewport ?? {
    scrollLeft: context.scrollLeft,
    plotWidth: context.paneWidth,
    plotHeight: paneHeight,
  }
}

function createToScreen(
  kWidth: number, kGap: number, dpr: number,
  pane: RenderContext['pane'], viewport: SafeViewport
): ToScreenFn {
  const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
  return (anchor) => {
    if (!Number.isFinite(anchor.index) || anchor.index < 0) {
      return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
    }
    const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
    return { x, y: pane.yAxis.priceToY(anchor.price) }
  }
}

function renderPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: DrawingPrimitive[],
  renderers: PrimitiveRendererSet,
  viewportClip: { left: number; top: number; right: number; bottom: number },
  dpr: number
): void {
  for (const primitive of primitives) {
    if (primitive.kind === 'point') {
      renderers.point(ctx, primitive, dpr)
      continue
    }
    if (primitive.kind === 'line') {
      renderers.line(ctx, primitive, viewportClip, dpr)
      continue
    }
    if (primitive.kind === 'area') {
      renderers.area(ctx, primitive, dpr)
      continue
    }
    renderers.text(ctx, primitive, dpr)
  }
}

/**
 * 查找当前选中且在指定 pane 内的绘图
 */
function findSelectedAnchorDrawing(
  store: DrawingStore,
  definitions: DrawingDefinitionRegistry,
  pane: RenderContext['pane'],
  seriesData: KLineData[],
  range: RenderContext['range'],
  context: RenderContext,
  kWidth: number,
  kGap: number,
  dpr: number,
  viewport: SafeViewport,
  toScreen: ToScreenFn
) {
  const selectedId = store.getSelectedId()
  if (!selectedId) return null

  const selectedDrawing = store.getAll().find(d => d.id === selectedId)
  if (!selectedDrawing || !selectedDrawing.visible || selectedDrawing.paneId !== pane.id) return null

  const geometry = definitions.compute(selectedDrawing, {
    pane,
    visibleData: seriesData.slice(range.start, range.end),
    seriesData,
    range,
    kLinePositions: context.kLinePositions,
    kLineCenters: context.kLineCenters,
    kBarRects: context.kBarRects,
    kWidth,
    kGap,
    dpr,
    paneWidth: context.paneWidth,
    viewport,
    toScreen,
  })
  if (!geometry) return null

  const allAnchors = [...selectedDrawing.anchors, ...(geometry.computedAnchors ?? [])]
  if (allAnchors.length === 0) return null

  return { drawing: selectedDrawing, allAnchors }
}

/**
 * 单次遍历锚点，同时计算价格范围和索引范围，推送到 context
 */
function pushAnchorBands(
  allAnchors: ReadonlyArray<{ price: number; index: number }>,
  context: RenderContext,
  pane: RenderContext['pane'],
  style: DrawingStyle | undefined,
  startXPx: number,
  unitPx: number,
  dpr: number
): void {
  if (allAnchors.length < 2) return

  let minP = Infinity, maxP = -Infinity
  let minIdx = Infinity, maxIdx = -Infinity

  for (const a of allAnchors) {
    if (Number.isFinite(a.price)) {
      if (a.price < minP) minP = a.price
      if (a.price > maxP) maxP = a.price
    }
    if (Number.isFinite(a.index) && a.index >= 0) {
      if (a.index < minIdx) minIdx = a.index
      if (a.index > maxIdx) maxIdx = a.index
    }
  }

  const strokeColor = style?.stroke ?? '#2962ff'

  if (Number.isFinite(minP) && Number.isFinite(maxP) && minP !== maxP) {
    if (!context.yAxisRanges) context.yAxisRanges = []
    context.yAxisRanges.push({
      topY: pane.yAxis.priceToY(maxP),
      bottomY: pane.yAxis.priceToY(minP),
      color: strokeColor,
      opacity: 0.15,
    })
  }

  if (Number.isFinite(minIdx) && Number.isFinite(maxIdx) && minIdx !== maxIdx) {
    if (!context.xAxisRanges) context.xAxisRanges = []
    const leftX = (startXPx + minIdx * unitPx + (unitPx - 1) / 2) / dpr
    const rightX = (startXPx + maxIdx * unitPx + (unitPx - 1) / 2) / dpr
    context.xAxisRanges.push({
      leftX,
      rightX,
      color: strokeColor,
      opacity: 0.15,
    })
  }
}

/**
 * 遍历锚点，推送 Y 轴和 X 轴标签
 */
function pushAnchorLabels(
  allAnchors: ReadonlyArray<{ index: number; price: number; time?: number | string }>,
  context: RenderContext,
  pane: RenderContext['pane'],
  viewport: SafeViewport,
  kWidth: number,
  style: DrawingStyle | undefined,
  seriesData: KLineData[],
  startXPx: number,
  unitPx: number,
  dpr: number
): void {
  if (pane.role !== 'price') return

  const strokeColor = style?.stroke ?? '#2962ff'

  const getTimestampForIndex = (idx: number): number | null => {
    if (idx >= 0 && idx < seriesData.length) {
      return seriesData[idx]?.timestamp ?? null
    }
    if (seriesData.length >= 2 && idx >= seriesData.length) {
      const lastIdx = seriesData.length - 1
      const secondLastIdx = seriesData.length - 2
      const lastTs = seriesData[lastIdx]!.timestamp
      const secondLastTs = seriesData[secondLastIdx]!.timestamp
      const timeStep = lastTs - secondLastTs
      return lastTs + (idx - lastIdx) * timeStep
    }
    return null
  }

  for (const anchor of allAnchors) {
    if (!Number.isFinite(anchor.index) || !Number.isFinite(anchor.price)) continue

    const screenPoint = (() => {
      if (anchor.index < 0) {
        return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
      }
      const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
      return { x, y: pane.yAxis.priceToY(anchor.price) }
    })()

    if (screenPoint.y >= 0 && screenPoint.y <= pane.height) {
      if (!context.yAxisLabels) context.yAxisLabels = []
      context.yAxisLabels.push({
        dataIndex: Math.round(anchor.index),
        price: anchor.price,
        y: screenPoint.y,
        style: {
          bgColor: strokeColor,
          borderColor: strokeColor,
          textColor: '#ffffff',
        }
      })
    }

    if (screenPoint.x >= -kWidth && screenPoint.x <= viewport.plotWidth + kWidth) {
      const timestamp = anchor.time
        ? (typeof anchor.time === 'string' ? new Date(anchor.time).getTime() : anchor.time)
        : getTimestampForIndex(Math.round(anchor.index))
      if (!timestamp) continue

      if (!context.xAxisLabels) context.xAxisLabels = []
      context.xAxisLabels.push({
        dataIndex: Math.round(anchor.index),
        timestamp,
        x: screenPoint.x + viewport.scrollLeft,
        style: {
          bgColor: strokeColor,
          textColor: '#ffffff',
        }
      })
    }
  }
}

/**
 * 为选中的绘图推送锚点轴标签
 * 提取为独立函数供主插件和 overlay 插件共用
 */
function pushSelectedDrawingLabels(
  store: DrawingStore,
  definitions: DrawingDefinitionRegistry,
  context: RenderContext,
  pane: RenderContext['pane'],
  seriesData: KLineData[],
  range: RenderContext['range'],
  kWidth: number,
  kGap: number,
  dpr: number,
  viewport: SafeViewport,
  startXPx: number,
  unitPx: number
): void {
  const toScreen = createToScreen(kWidth, kGap, dpr, pane, viewport)
  const found = findSelectedAnchorDrawing(store, definitions, pane, seriesData, range, context, kWidth, kGap, dpr, viewport, toScreen)
  if (!found) return

  pushAnchorBands(found.allAnchors, context, pane, found.drawing.style, startXPx, unitPx, dpr)
  pushAnchorLabels(found.allAnchors, context, pane, viewport, kWidth, found.drawing.style, seriesData, startXPx, unitPx, dpr)
}

/**
 * 创建绘图渲染器插件（主层，负责绘制 shape）
 * 注意：此插件不再推送轴标签，标签由 createDrawingLabelOverlayPlugin 负责
 */
export function createDrawingRendererPlugin(options: {
  store: DrawingStore
  paneId?: string
  definitions?: DrawingDefinitionRegistry
  renderers?: PrimitiveRendererSet
}): RendererPlugin {
  const store = options.store
  const definitions = options.definitions ?? new DrawingDefinitionRegistry()
  const renderers = options.renderers ?? createDefaultPrimitiveRendererSet()
  registerDefaultDrawingDefinitions(definitions)

  return {
    name: 'drawingRenderer',
    version: '0.1.0',
    description: '绘图渲染器（仅负责绘制形状）',
    debugName: '绘图层',
    paneId: options.paneId ?? 'main',
    priority: 55,
    draw(context: RenderContext) {
      const { ctx, pane, data, range, dpr, paneWidth, kLinePositions, kLineCenters, kBarRects, kWidth, kGap } = context
      const viewport = resolveViewport(context, pane.height)
      const seriesData = data as KLineData[]
      const visibleData = seriesData.slice(range.start, range.end)
      const drawings = store.getVisibleByPane(pane.id)
      if (drawings.length === 0) return

      const viewportClip = {
        left: 0,
        top: 0,
        right: viewport.plotWidth,
        bottom: pane.height,
      }
      const toScreen = createToScreen(kWidth, kGap, dpr, pane, viewport)

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, viewport.plotWidth, pane.height)
      ctx.clip()

      for (const drawing of drawings) {
        const geometry = definitions.compute(drawing, {
          pane,
          visibleData,
          seriesData,
          range,
          kLinePositions,
          kLineCenters,
          kBarRects,
          kWidth,
          kGap,
          dpr,
          paneWidth,
          viewport,
          toScreen,
        })
        if (!geometry) continue

        const isSelected = store.getSelectedId() === drawing.id
        const primitives = isSelected
          ? geometry.primitives.map((p) => applySelectedStyle(p, drawing.style))
          : geometry.primitives

        renderPrimitives(ctx, primitives, renderers, viewportClip, dpr)
      }

      ctx.restore()
    },
  }
}

/**
 * 创建绘图标签 Overlay 插件
 * 
 * ⚠️ 警告：此插件必须在 All 和 Overlay 更新级别运行
 * 当前代码库中没有 UpdateLevel.Main 的触发点，因此此插件设置为 layer: 'overlay' 是安全的
 * 如果将来添加 Main 级别的更新，此插件会被跳过，导致选中绘图的轴标签消失
 * 
 * 解决方案：如果将来需要使用 Main 级别，请将此插件改为同时在 main 和 overlay 层注册，
 * 或移除分层过滤让此插件在所有级别运行
 */
export function createDrawingLabelOverlayPlugin(options: {
  store: DrawingStore
  paneId?: string
  definitions?: DrawingDefinitionRegistry
}): RendererPlugin {
  const store = options.store
  const definitions = options.definitions ?? new DrawingDefinitionRegistry()
  registerDefaultDrawingDefinitions(definitions)

  return {
    name: 'drawingLabelOverlay',
    version: '0.1.0',
    description: '绘图轴标签渲染器（overlay 层，负责推送选中绘图的轴标签）',
    debugName: '绘图标签层',
    paneId: options.paneId ?? 'main',
    layer: 'overlay',
    priority: -24, // 比主绘图层稍晚，确保在其他 overlay 插件之后
    draw(context: RenderContext) {
      const { pane, data, range, dpr, paneWidth, kWidth, kGap } = context
      const viewport = resolveViewport(context, pane.height)
      const seriesData = data as KLineData[]
      const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)

      pushSelectedDrawingLabels(
        store,
        definitions,
        context,
        pane,
        seriesData,
        range,
        kWidth,
        kGap,
        dpr,
        viewport,
        startXPx,
        unitPx
      )
    },
  }
}

function applySelectedStyle(primitive: DrawingPrimitive, baseStyle: DrawingStyle): DrawingPrimitive {
  const selectedStroke = baseStyle.stroke ?? '#2962ff'
  const selectedWidth = (baseStyle.strokeWidth ?? 1) + 1
  const selectedPointRadius = (baseStyle.pointRadius ?? 4) + 2

  if (primitive.kind === 'point') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke, pointRadius: selectedPointRadius } }
  }
  if (primitive.kind === 'line') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke, strokeWidth: selectedWidth } }
  }
  if (primitive.kind === 'area') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke } }
  }
  // text
  return { ...primitive, style: { ...primitive.style, textColor: selectedStroke, fontSize: (primitive.style?.fontSize ?? 12) + 1 } }
}
