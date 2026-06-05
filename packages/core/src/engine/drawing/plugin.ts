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
  viewport: NonNullable<RenderContext['viewport']>,
  startXPx: number,
  unitPx: number
): void {
  const selectedId = store.getSelectedId()
  if (!selectedId) return

  const selectedDrawing = store.getAll().find(d => d.id === selectedId)
  if (!selectedDrawing || !selectedDrawing.visible || selectedDrawing.paneId !== pane.id) return

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
    toScreen(anchor) {
      if (!Number.isFinite(anchor.index) || anchor.index < 0) {
        return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
      }
      const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
      return { x, y: pane.yAxis.priceToY(anchor.price) }
    },
  })

  if (!geometry) return

  // 只在价格 pane 时添加标签
  if (pane.role !== 'price') return

  // 合并用户锚点和计算锚点
  const allAnchors = [...selectedDrawing.anchors, ...(geometry.computedAnchors ?? [])]
  if (allAnchors.length === 0) return

  // 计算锚点价格范围，用于Y轴价格范围带
  if (allAnchors.length >= 2) {
    let minP = Infinity, maxP = -Infinity
    for (const a of allAnchors) {
      if (!Number.isFinite(a.price)) continue
      if (a.price < minP) minP = a.price
      if (a.price > maxP) maxP = a.price
    }
    if (Number.isFinite(minP) && Number.isFinite(maxP) && minP !== maxP) {
      if (!context.yAxisRanges) context.yAxisRanges = []
      context.yAxisRanges.push({
        topY: pane.yAxis.priceToY(maxP),
        bottomY: pane.yAxis.priceToY(minP),
        color: selectedDrawing.style?.stroke ?? '#2962ff',
        opacity: 0.15,
      })
    }
  }

  // 计算锚点X坐标范围，用于X轴时间范围带
  if (allAnchors.length >= 2) {
    let minIdx = Infinity, maxIdx = -Infinity
    for (const a of allAnchors) {
      if (!Number.isFinite(a.index) || a.index < 0) continue
      if (a.index < minIdx) minIdx = a.index
      if (a.index > maxIdx) maxIdx = a.index
    }
    if (Number.isFinite(minIdx) && Number.isFinite(maxIdx) && minIdx !== maxIdx) {
      if (!context.xAxisRanges) context.xAxisRanges = []
      const leftX = (startXPx + minIdx * unitPx + (unitPx - 1) / 2) / dpr
      const rightX = (startXPx + maxIdx * unitPx + (unitPx - 1) / 2) / dpr
      context.xAxisRanges.push({
        leftX,
        rightX,
        color: selectedDrawing.style?.stroke ?? '#2962ff',
        opacity: 0.15,
      })
    }
  }

  // 辅助函数：根据index获取时间戳
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

  // 推送每个锚点的标签
  for (const anchor of allAnchors) {
    if (!Number.isFinite(anchor.index) || !Number.isFinite(anchor.price)) continue

    const screenPoint = (() => {
      if (anchor.index < 0) {
        return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
      }
      const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
      return { x, y: pane.yAxis.priceToY(anchor.price) }
    })()

    // Y轴标签
    if (screenPoint.y >= 0 && screenPoint.y <= pane.height) {
      if (!context.yAxisLabels) context.yAxisLabels = []
      context.yAxisLabels.push({
        dataIndex: Math.round(anchor.index),
        price: anchor.price,
        y: screenPoint.y,
        style: {
          bgColor: selectedDrawing.style?.stroke ?? '#2962ff',
          borderColor: selectedDrawing.style?.stroke ?? '#2962ff',
          textColor: '#ffffff',
        }
      })
    }

    // X轴标签
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
          bgColor: selectedDrawing.style?.stroke ?? '#2962ff',
          textColor: '#ffffff',
        }
      })
    }
  }
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
      const viewport = context.viewport ?? {
        scrollLeft: context.scrollLeft,
        plotWidth: paneWidth,
        plotHeight: pane.height,
      }
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
          toScreen(anchor) {
            const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
            if (!Number.isFinite(anchor.index) || anchor.index < 0) {
              return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
            }
            const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
            return { x, y: pane.yAxis.priceToY(anchor.price) }
          },
        })
        if (!geometry) continue

        const isSelected = store.getSelectedId() === drawing.id
        const primitives = isSelected
          ? geometry.primitives.map((p) => applySelectedStyle(p, drawing.style))
          : geometry.primitives

        // 绘制形状（不再推送轴标签，标签由 overlay 插件负责）
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
      const viewport = context.viewport ?? {
        scrollLeft: context.scrollLeft,
        plotWidth: paneWidth,
        plotHeight: pane.height,
      }
      const seriesData = data as KLineData[]
      const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)

      // 推送选中绘图的锚点标签
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
