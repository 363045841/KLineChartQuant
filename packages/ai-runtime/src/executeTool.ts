import type { ChartController, ToolCall, ToolResult } from '@363045841yyt/klinechart-core'
import { findTool } from './toolSchemas'

export type { ToolCall, ToolResult }

// follow-ignore-next-line complexity
export function executeTool(
  chart: ChartController,
  call: ToolCall,
): ToolResult {
  const schema = findTool(call.name)
  if (!schema) {
    return { success: false, error: `Unknown tool: ${call.name}` }
  }

  const inputSchema = schema.inputSchema
  if ('type' in inputSchema && inputSchema.type === 'object' && inputSchema.required) {
    const missing = inputSchema.required.filter((k) => !(k in call.input))
    if (missing.length > 0) {
      return {
        success: false,
        error: `Missing required parameters for '${call.name}': ${missing.join(', ')}`,
      }
    }
  }

  switch (call.name) {
    case 'chart.zoomToLevel': {
      const { level, anchorX } = call.input as {
        level: number
        anchorX?: number
      }
      chart.zoomToLevel(level, anchorX)
      return { success: true }
    }

    case 'chart.setTheme': {
      const { theme } = call.input as { theme: 'light' | 'dark' }
      chart.setTheme(theme)
      return { success: true }
    }

    case 'chart.scrollToRight': {
      chart.scrollToRight()
      return { success: true }
    }

    case 'chart.zoomIn': {
      const { anchorX } = call.input as { anchorX?: number }
      chart.zoomIn(anchorX)
      return { success: true }
    }

    case 'chart.zoomOut': {
      const { anchorX } = call.input as { anchorX?: number }
      chart.zoomOut(anchorX)
      return { success: true }
    }

    case 'indicators.add': {
      const { definitionId } = call.input as { definitionId: string }
      const def = chart.catalog.find((d) => d.id === definitionId)
      const role = def?.role ?? 'main'
      const instanceId = chart.addIndicator(definitionId, role)
      return { success: true, data: { instanceId } }
    }

    case 'indicators.remove': {
      const { instanceId } = call.input as { instanceId: string }
      const ok = chart.removeIndicator(instanceId)
      return ok
        ? { success: true }
        : { success: false, error: `Indicator ${instanceId} not found` }
    }

    case 'indicators.updateParams': {
      const { instanceId, params } = call.input as {
        instanceId: string
        params: Record<string, unknown>
      }
      const ok = chart.updateIndicatorParams(instanceId, params)
      return ok
        ? { success: true }
        : { success: false, error: `Indicator ${instanceId} not found` }
    }

    case 'data.setSymbols': {
      const input = call.input as {
        symbol: string
        exchange?: string
        period?: string
        adjust?: string
        source?: string
        startDate?: string
        endDate?: string
      }
      chart.setSymbols([{
        symbol: input.symbol,
        exchange: input.exchange,
        period: input.period,
        adjust: input.adjust,
        source: input.source,
        startDate: input.startDate,
        endDate: input.endDate,
      }])
      return { success: true }
    }

    case 'data.appendData': {
      const { bars } = call.input as {
        bars: Array<{ timestamp?: number; open: number; high: number; low: number; close: number; volume?: number }>
      }
      chart.appendData(bars)
      return { success: true }
    }

    case 'data.updateData': {
      const { bars } = call.input as {
        bars: Array<{ timestamp?: number; open: number; high: number; low: number; close: number; volume?: number }>
      }
      chart.updateData(bars)
      return { success: true }
    }

    case 'data.addComparisonSymbol': {
      const input = call.input as { symbol: string; exchange?: string; source?: string }
      chart.addComparisonSymbol({
        symbol: input.symbol,
        exchange: input.exchange,
        source: input.source,
      })
      return { success: true }
    }

    case 'data.removeComparisonSymbol': {
      const { symbol } = call.input as { symbol: string }
      chart.removeComparisonSymbol(symbol)
      return { success: true }
    }

    case 'drawing.setTool': {
      const { tool } = call.input as { tool: string | null }
      chart.setDrawingTool(tool)
      return { success: true }
    }

    case 'drawing.add': {
      const input = call.input as {
        kind: string
        anchors: Array<{ barIndex: number; price: number }>
        style?: Record<string, unknown>
      }
      const existing = chart.getFullDrawings()
      const newDrawing: Record<string, unknown> = {
        id: crypto.randomUUID(),
        kind: input.kind,
        paneId: 'main',
        visible: true,
        anchors: input.anchors.map((a, i) => ({
          id: `a-${Date.now()}-${i}`,
          index: a.barIndex,
          price: a.price,
        })),
        params: {},
        style: { stroke: '#2962ff', strokeWidth: 1, fillOpacity: 0.1, ...(input.style ?? {}) },
      }
      chart.setDrawings([...existing, newDrawing])
      return { success: true, data: { drawingId: newDrawing.id } }
    }

    case 'drawing.clear': {
      chart.clearDrawings()
      return { success: true }
    }

    case 'drawing.remove': {
      const { drawingId } = call.input as { drawingId: string }
      chart.removeDrawing(drawingId)
      return { success: true }
    }

    case 'markers.update': {
      const { markers } = call.input as { markers: Array<{ id: string; date: string; shape: string; groupKey?: string; style?: Record<string, unknown>; label?: { text: string; position?: string } }> }
      chart.updateCustomMarkers(markers)
      return { success: true }
    }

    case 'markers.clear': {
      chart.clearCustomMarkers()
      return { success: true }
    }

    case 'settings.update': {
      const { settings, options } = call.input as { settings?: Record<string, unknown>; options?: Record<string, unknown> }
      if (settings) chart.updateSettingsFacade(settings)
      if (options) chart.updateOptionsFacade(options)
      return { success: true }
    }

    case 'alerts.addPriceCross':
    case 'alerts.addIndicatorCross':
    case 'alerts.remove': {
      return {
        success: false,
        error: `"${call.name}" is not implemented — alerts controller is not available`,
      }
    }

    case 'replay.seekTo':
    case 'replay.play':
    case 'replay.pause':
    case 'replay.setSpeed': {
      return {
        success: false,
        error: `"${call.name}" is not implemented — replay controller is not available`,
      }
    }

    default: {
      return { success: false, error: `No handler registered for ${call.name}` }
    }
  }
}
