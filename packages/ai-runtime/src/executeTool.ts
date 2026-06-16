import type { ChartController, ToolCall, ToolResult } from '@363045841yyt/klinechart-core'
import { findTool } from './toolSchemas'

export type { ToolCall, ToolResult }

// fallow-ignore-next-line complexity
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
