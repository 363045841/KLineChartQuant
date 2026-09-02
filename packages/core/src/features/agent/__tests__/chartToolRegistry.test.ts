// 本文件验证 Core 图表 API 的 @Tool 注册与参数校验边界。
import { describe, expect, it } from 'vitest'

import { getRegisteredChartTools } from '../chartAgentController'

describe('Chart Agent @Tool registry', () => {
  it('registers the exact instrument lookup directly on the Core API', async () => {
    const tool = getRegisteredChartTools().find(
      (item) => item.config.name === 'instruments_query_name',
    )

    expect(tool?.config).toMatchObject({
      safety: 'read-only',
      executionMode: 'parallel',
    })
    await expect(
      tool?.execute(
        {},
        { symbol: 600519 },
        {
          signal: new AbortController().signal,
          progress: () => undefined,
        },
      ),
    ).rejects.toThrow('/symbol: must be string')
  })

  it('registers drawing mutations as destructive tools with complete schemas', async () => {
    const tools = getRegisteredChartTools()
    const create = tools.find((tool) => tool.config.name === 'drawing_create')
    const update = tools.find((tool) => tool.config.name === 'drawing_update')
    const remove = tools.find((tool) => tool.config.name === 'drawing_delete')
    const clear = tools.find((tool) => tool.config.name === 'drawings_clear')

    expect(create?.config).toMatchObject({ safety: 'destructive', executionMode: 'sequential' })
    expect(update?.config.safety).toBe('destructive')
    expect(remove?.config.safety).toBe('destructive')
    expect(clear?.config.safety).toBe('destructive')
    await expect(
      create?.execute(
        {},
        { kind: 'trend-line', paneId: 'main', anchors: [{ tradingDate: '2026-09-01' }] },
        {
          signal: new AbortController().signal,
          progress: () => undefined,
        },
      ),
    ).rejects.toThrow('/anchors/0: must have required properties price')

    await expect(
      create?.execute(
        {},
        { kind: 'horizontal-line', paneId: 'main', anchors: [{ tradingDate: 1_000, price: 10 }] },
        {
          signal: new AbortController().signal,
          progress: () => undefined,
        },
      ),
    ).rejects.toThrow('/anchors/0/tradingDate: must be string')
  })
})
