import type { ChartController } from '@363045841yyt/klinechart-core'
import { findTool } from './toolSchemas.ts'

export interface ToolCall {
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  error?: string
  data?: unknown
}

export function executeTool(
  chart: ChartController,
  call: ToolCall,
): ToolResult {
  const schema = findTool(call.name)
  if (!schema) {
    return { success: false, error: `Unknown tool: ${call.name}` }
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

    // Alerts controller does not exist on main yet — placeholder
    case 'alerts.addPriceCross':
    case 'alerts.addIndicatorCross':
    case 'alerts.remove': {
      return {
        success: false,
        error: `"${call.name}" is not implemented — alerts controller is not available`,
      }
    }

    // Replay controller does not exist on main yet — placeholder
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
