// 本文件验证指标查询工具的输入边界和宿主调用行为。
import { describe, expect, it, vi } from 'vitest'

import { AgentRuntimeError, createIndicatorQueryTool } from '../index'

describe('createIndicatorQueryTool', () => {
  /** 创建可观测的只读查询端口。 */
  function createPort() {
    return {
      queryIndicator: vi.fn(async () => 'RSI(14)\n2025-01-01 58.2'),
    }
  }

  /** 创建运行工具所需的最小上下文。 */
  function createContext() {
    return {
      runId: 'run-1',
      toolCallId: 'call-1',
      signal: new AbortController().signal,
      progress: vi.fn(),
    }
  }

  it('forwards validated inputs to the host query port and returns compact text', async () => {
    const port = createPort()
    const tool = createIndicatorQueryTool(port)
    const context = createContext()

    const result = await tool.execute(
      { definitionId: 'rsi', params: { period: 14 }, from: 1, to: 2, limit: 10 },
      context,
    )

    expect(port.queryIndicator).toHaveBeenCalledWith({
      definitionId: 'rsi',
      params: { period: 14 },
      from: 1,
      to: 2,
      limit: 10,
    })
    expect(context.progress).toHaveBeenCalledWith({
      label: 'Calculating indicator',
      current: 1,
      total: 1,
    })
    expect(result.content).toBe('RSI(14)\n2025-01-01 58.2')
    expect(result.summary).toBe('Returned 10 indicator entries.')
  })

  it('rejects malformed model input before calling the host query port', async () => {
    const port = createPort()
    const tool = createIndicatorQueryTool(port)

    await expect(
      tool.execute({ definitionId: 'rsi', params: { period: '14' } }, createContext()),
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' } satisfies Partial<AgentRuntimeError>)
    expect(port.queryIndicator).not.toHaveBeenCalled()
  })
})
