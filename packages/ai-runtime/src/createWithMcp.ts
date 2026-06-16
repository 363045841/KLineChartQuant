import {
  createChartController,
  type ChartMountOptions,
  type ChartController,
} from '@363045841yyt/klinechart-core'
import { executeTool } from './executeTool'

export interface CreateChartWithMcpOptions extends ChartMountOptions {
  mcp: {
    wsUrl?: string
    autoReconnect?: boolean
  }
}

export function createChartControllerWithMcp(
  opts: CreateChartWithMcpOptions,
): ChartController {
  let ctrl: ChartController
  ctrl = createChartController({
    ...opts,
    mcp: {
      wsUrl: opts.mcp.wsUrl,
      autoReconnect: opts.mcp.autoReconnect,
      onToolCall: (call) => executeTool(ctrl, call),
    },
  })
  return ctrl
}
