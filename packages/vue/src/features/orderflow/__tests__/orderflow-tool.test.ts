// 订单流工具与客户端的单元测试。
//
// 重点不在「能返回字符串」，而在三处容易静默出错的契约：
// 1. 品种归一化（图表显示 BTCUSDT.P，数据端要 BTCUSDT）；
// 2. 省略 symbol 时回落到当前图表品种；
// 3. 服务不可用时必须明确失败，不能编造面板数字。

import { describe, expect, it, vi } from 'vitest'
import { createOrderflowClient, DEFAULT_ORDERFLOW_BASE_URL } from '../impl/orderflow-client'
import {
  createOrderflowSnapshotTool,
  normalizeOrderflowSymbol,
  ORDERFLOW_SNAPSHOT_TOOL_NAME,
} from '../impl/orderflow-snapshot-tool'
import type { OrderflowPanelSource } from '../types'

/**
 * 构造工具执行上下文。
 *
 * @returns 带取消信号与进度回调的上下文
 */
function toolContext(): {
  readonly runId: string
  readonly toolCallId: string
  readonly signal: AbortSignal
  readonly progress: () => void
} {
  return {
    runId: 'run-1',
    toolCallId: 'call-1',
    signal: new AbortController().signal,
    progress: () => {},
  }
}

describe('normalizeOrderflowSymbol', () => {
  it('去掉永续展示后缀', () => {
    expect(normalizeOrderflowSymbol('BTCUSDT.P')).toBe('BTCUSDT')
  })

  it('统一大写', () => {
    expect(normalizeOrderflowSymbol('btcusdt')).toBe('BTCUSDT')
  })

  it('保留不带后缀的代码', () => {
    expect(normalizeOrderflowSymbol('ETHUSDT')).toBe('ETHUSDT')
  })

  it('空值与空串返回 null', () => {
    expect(normalizeOrderflowSymbol(null)).toBeNull()
    expect(normalizeOrderflowSymbol(undefined)).toBeNull()
    expect(normalizeOrderflowSymbol('   ')).toBeNull()
    expect(normalizeOrderflowSymbol('.P')).toBeNull()
  })
})

describe('createOrderflowSnapshotTool', () => {
  /**
   * 造一个只记录调用的假数据源。
   *
   * @param text 返回的文本
   * @returns 数据源与调用记录
   */
  function fakeSource(text: string): {
    source: OrderflowPanelSource
    calls: string[]
  } {
    const calls: string[] = []
    return {
      calls,
      source: {
        async fetchPanelText(symbol: string): Promise<string> {
          calls.push(symbol)
          return text
        },
        async fetchPanel(): Promise<unknown> {
          return { symbol: 'BTCUSDT' }
        },
      },
    }
  }

  it('省略 symbol 时用当前图表品种，并归一化', async () => {
    const { source, calls } = fakeSource('面板文本')
    const tool = createOrderflowSnapshotTool(source, () => 'BTCUSDT.P')
    const result = await tool.execute({}, toolContext())
    expect(calls).toEqual(['BTCUSDT'])
    expect(result.content).toBe('面板文本')
  })

  it('显式 symbol 优先于当前品种', async () => {
    const { source, calls } = fakeSource('面板文本')
    const tool = createOrderflowSnapshotTool(source, () => 'BTCUSDT.P')
    await tool.execute({ symbol: 'ETHUSDT' }, toolContext())
    expect(calls).toEqual(['ETHUSDT'])
  })

  it('拿不到品种时明确报错，不请求服务', async () => {
    const { source, calls } = fakeSource('面板文本')
    const tool = createOrderflowSnapshotTool(source, () => null)
    const result = await tool.execute({}, toolContext())
    expect(calls).toEqual([])
    expect(result.content).toContain('没有可用的交易对')
    expect(result.failure).toBeUndefined()
  })

  it('服务失败时返回可重试失败，并提示不要编造数据', async () => {
    const tool = createOrderflowSnapshotTool(
      {
        async fetchPanelText(): Promise<string> {
          throw new Error('连接被拒绝')
        },
        async fetchPanel(): Promise<unknown> {
          return {}
        },
      },
      () => 'BTCUSDT',
    )
    const result = await tool.execute({}, toolContext())
    expect(result.content).toContain('连接被拒绝')
    expect(result.content).toContain('不要凭猜测')
    expect(result.failure).toEqual({
      code: 'TOOL_ERROR',
      message: 'Orderflow panel is unavailable.',
      retryable: true,
    })
  })

  it('工具是可读的只读并行工具', () => {
    const { source } = fakeSource('x')
    const tool = createOrderflowSnapshotTool(source, () => 'BTCUSDT')
    expect(tool.name).toBe(ORDERFLOW_SNAPSHOT_TOOL_NAME)
    expect(tool.safety).toBe('read-only')
    expect(tool.executionMode).toBe('parallel')
    // 描述里必须写死反事实，防止模型把面板读成买卖建议
    expect(tool.description).toContain('NOT a trading signal')
    expect(tool.description).toContain('49.8%')
  })
})

describe('createOrderflowClient', () => {
  it('按默认地址拼出文本请求', async () => {
    const seen: string[] = []
    const client = createOrderflowClient({
      fetch: async (input: RequestInfo | URL) => {
        seen.push(String(input))
        return new Response('面板', { status: 200 })
      },
    })
    const text = await client.fetchPanelText('BTCUSDT')
    expect(text).toBe('面板')
    expect(seen).toEqual([
      `${DEFAULT_ORDERFLOW_BASE_URL}/orderflow/panel?symbol=BTCUSDT&format=text`,
    ])
  })

  it('非 2xx 抛出带状态码的错误', async () => {
    const client = createOrderflowClient({
      fetch: async () => new Response('boom', { status: 503 }),
    })
    await expect(client.fetchPanelText('BTCUSDT')).rejects.toThrow(/503/)
  })

  it('允许宿主覆盖地址，并忽略尾部斜杠', async () => {
    const seen: string[] = []
    const client = createOrderflowClient({
      fetch: async (input: RequestInfo | URL) => {
        seen.push(String(input))
        return new Response('{}', { status: 200 })
      },
      baseUrl: 'http://127.0.0.1:9999/',
    })
    await client.fetchPanel('BTCUSDT')
    expect(seen[0]).toBe('http://127.0.0.1:9999/orderflow/panel?symbol=BTCUSDT')
  })
})
