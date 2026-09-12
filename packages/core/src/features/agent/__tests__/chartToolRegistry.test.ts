// 本文件验证 Core 图表 API 的 @Tool 注册与参数校验边界。
import { describe, expect, it } from 'vitest'

import type { SymbolSpec } from '../../../controllers/types'
import { ComparisonCommands } from '../../../engine/data/comparisonCommands'
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

  it('registers comparison CRUD with matching safety levels', () => {
    const tools = getRegisteredChartTools()

    expect(tools.find((tool) => tool.config.name === 'comparisons_list')?.config).toMatchObject({
      safety: 'read-only',
      executionMode: 'parallel',
    })
    for (const name of ['comparison_create', 'comparison_remove', 'comparisons_clear']) {
      expect(tools.find((tool) => tool.config.name === name)?.config).toMatchObject({
        safety: 'destructive',
        executionMode: 'sequential',
      })
    }
  })

  it('auto-records the real method name and owns its primitive host', async () => {
    const tools = getRegisteredChartTools()
    const create = tools.find((tool) => tool.config.name === 'comparison_create')!

    // 工具名面向 Agent，方法名由装饰器自动记录，用于精确定位宿主。
    expect(create.methodName).toBe('create')
    expect(create.config.name).not.toBe(create.methodName)

    let specs: SymbolSpec[] = []
    const comparison = new ComparisonCommands({
      getSpecs: () => specs,
      setSpecs: (next) => {
        specs = [...next]
      },
      setComparisonViewActive: () => undefined,
      validateSpec: () => undefined,
      registerSpec: () => undefined,
      resolveInstrument: async ({ symbol }) => ({
        candidates: [
          {
            id: symbol,
            sourceId: 'mock',
            symbol,
            name: symbol,
            assetClass: 'stock',
            exchange: 'SSE',
            sessionId: 'CN',
            capabilities: {},
          },
        ],
        searchedSourceIds: ['mock'],
        foundElsewhereSourceIds: [],
      }),
      getColor: () => undefined,
      scheduleDraw: () => undefined,
    })

    expect(create.owns(comparison)).toBe(true)
    expect(create.owns({})).toBe(false)

    await expect(
      create.execute(
        comparison,
        { symbol: '511090' },
        { signal: new AbortController().signal, progress: () => undefined },
      ),
    ).resolves.toEqual({ status: 'added', symbol: '511090', name: '511090' })
    expect(specs.map((spec) => spec.symbol)).toEqual(['511090'])
  })
})
